import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { asc, isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { officeEvents, projects, workspaces } from "../db/schema";
import type { EventBus } from "../events";
import { getDaemonClient } from "../terminal/daemon-client-singleton";
import {
	disposeSessionAndWait,
	isLiveTerminalSession,
	sendAgentMessage,
	transcriptSession,
} from "../terminal/terminal";
import type {
	TerminalAgentBinding,
	TerminalAgentStore,
} from "../terminal-agents";
import { resolveHostAgentConfig } from "../terminal-agents/agent-config";
import {
	findResumedSuccessorTerminalId,
	listResumeCandidateBindings,
} from "../terminal-agents/persistence";
import {
	type CityAgentInfo,
	CityRooms,
	type LostAgent,
	lastAnswer,
	MEETING_ROOM,
} from "./cityRooms";
import { CityTeam, type CityTeamEvent, type CityTeamLog } from "./cityTeam";
import { TerminalWatch } from "./terminalWatch";

const REPLY_CHARS = 12_000;

/**
 * The city's rooms and team wired to this host: its agents, workspaces, terminals and lifecycle
 * events.
 */
export function createCityRooms({
	db,
	eventBus,
	terminalAgentStore,
	statePath,
	runAgent,
	resumeAgent,
	officeCli,
}: {
	db: HostDb;
	eventBus: EventBus;
	terminalAgentStore: TerminalAgentStore;
	statePath: string;
	/** Starts an agent in a workspace, the same way the app does. */
	runAgent: (input: {
		workspaceId: string;
		agent: string;
		prompt: string;
	}) => Promise<{ sessionId: string }>;
	/** Continues an agent whose terminal stopped in a new terminal, the same way the app does. */
	resumeAgent: (input: {
		workspaceId: string;
		terminalId: string;
	}) => Promise<{ resumed: true; terminalId: string } | { resumed: false }>;
	officeCli?: string;
}): { rooms: CityRooms; team: CityTeam } {
	mkdirSync(dirname(statePath), { recursive: true });
	const workspaceRows = () =>
		db
			.select({
				id: workspaces.id,
				projectId: workspaces.projectId,
				name: workspaces.name,
				branch: workspaces.branch,
				path: workspaces.worktreePath,
			})
			.from(workspaces)
			.where(isNull(workspaces.archivedAt))
			.all();
	const projectNames = () =>
		new Map(
			db
				.select({ id: projects.id, name: projects.name })
				.from(projects)
				.all()
				.map((p) => [p.id, p.name]),
		);

	const agents = (): CityAgentInfo[] => {
		const byId = new Map(workspaceRows().map((w) => [w.id, w]));
		const names = projectNames();
		return terminalAgentStore.list().flatMap((binding) => {
			if (binding.endedAt !== undefined || binding.chatSessionId) return [];
			const workspace = byId.get(binding.workspaceId);
			if (!workspace?.projectId) return [];
			return [
				{
					terminalId: binding.terminalId,
					workspaceId: binding.workspaceId,
					projectId: workspace.projectId,
					agentId: binding.agentId,
					label: AGENT_IDENTITY_LABELS[binding.agentId] ?? binding.agentId,
					workspaceName: workspace.name || workspace.branch,
					projectName: names.get(workspace.projectId) || "a project",
				},
			];
		});
	};

	const workspaceOf = (workspaceId: string) => {
		const row = workspaceRows().find((w) => w.id === workspaceId);
		if (!row?.projectId) return null;
		return {
			projectId: row.projectId,
			name: row.name || row.branch,
			projectName: projectNames().get(row.projectId) || "a project",
			path: row.path,
			branch: row.branch,
		};
	};
	const send = async (
		agent: { terminalId: string; workspaceId: string },
		text: string,
	) => {
		const result = await sendAgentMessage({
			terminalId: agent.terminalId,
			workspaceId: agent.workspaceId,
			text,
			submit: true,
			db,
			eventBus,
			terminalAgentStore,
		});
		if ("error" in result) throw new Error(result.error);
	};
	const lastReply = async (agent: {
		terminalId: string;
		workspaceId: string;
	}) => {
		const result = await transcriptSession({
			terminalId: agent.terminalId,
			workspaceId: agent.workspaceId,
			maxChars: REPLY_CHARS,
			db,
			eventBus,
		});
		return "error" in result ? null : lastAnswer(result.text, result.source);
	};

	const daemonAlive = async () => {
		const daemon = await getDaemonClient();
		return new Set(
			(await daemon.list()).filter((s) => s.alive).map((s) => s.id),
		);
	};
	const watch = new TerminalWatch({ aliveIds: daemonAlive });
	const lostOf = (binding: TerminalAgentBinding, since: number): LostAgent => ({
		terminalId: binding.terminalId,
		workspaceId: binding.workspaceId,
		agentId: binding.agentId,
		startedAt: binding.startedAt,
		since,
		resumable:
			!!binding.agentSessionId &&
			(resolveHostAgentConfig(db, binding.definitionId ?? binding.agentId)
				?.resumeArgs.length ?? 0) > 0,
	});
	const lostAgents = (): LostAgent[] => {
		const running = terminalAgentStore
			.list()
			.filter((b) => b.endedAt === undefined && !b.chatSessionId);
		void watch.refresh(running.map((b) => b.terminalId));
		const stopped = running.flatMap((binding) => {
			const since = watch.goneSince(binding.terminalId);
			return since === undefined || isLiveTerminalSession(binding.terminalId)
				? []
				: [lostOf(binding, since)];
		});
		const ended = listResumeCandidateBindings(db)
			.filter((b) => !b.chatSessionId)
			.map((b) => lostOf(b, b.endedAt ?? b.lastEventAt));
		return [...stopped, ...ended];
	};
	const stopAgent = async (terminalId: string) => {
		terminalAgentStore.markTerminalDisposed(terminalId);
		await disposeSessionAndWait(terminalId, db);
	};
	const successorOf = (terminalId: string, workspaceId: string) =>
		findResumedSuccessorTerminalId(db, workspaceId, terminalId);

	const rooms = new CityRooms({
		statePath,
		onChange: () => eventBus.broadcastOfficeChanged("rooms"),
		agents,
		lostAgents,
		stopAgent,
		resumeAgent: async ({ terminalId, workspaceId }) => {
			if (terminalAgentStore.get(terminalId)) {
				const alive =
					isLiveTerminalSession(terminalId) ||
					(await daemonAlive()).has(terminalId);
				if (alive) throw new Error("Its terminal is running again");
				terminalAgentStore.markTerminalExited(terminalId);
			}
			const result = await resumeAgent({ workspaceId, terminalId });
			if (!result.resumed)
				throw new Error("There was no conversation left to continue");
			return { terminalId: result.terminalId };
		},
		...(officeCli ? { officeCli } : {}),
		successorOf,
		roomName: (projectId, roomId) => {
			if (roomId === MEETING_ROOM)
				return projectNames().has(projectId) ? "Meeting room" : null;
			const workspace = workspaceRows().find(
				(w) => w.id === roomId && w.projectId === projectId,
			);
			return workspace ? workspace.name || workspace.branch : null;
		},
		send,
		workspace: workspaceOf,
		startAgent: async (workspaceId, agent, prompt) => {
			const result = await runAgent({ workspaceId, agent, prompt });
			return { terminalId: result.sessionId };
		},
		lastReply,
	});

	const events: CityTeamEvent[] = db
		.select({ payload: officeEvents.payload })
		.from(officeEvents)
		.orderBy(asc(officeEvents.seq))
		.all()
		.map((row) => JSON.parse(row.payload) as CityTeamEvent);
	const log: CityTeamLog = {
		append: (event) => {
			db.insert(officeEvents)
				.values({
					at: Date.now(),
					kind: event.kind,
					payload: JSON.stringify(event),
				})
				.run();
			events.push(event);
		},
		all: () => events,
	};
	const team = new CityTeam({
		log,
		onChange: () => eventBus.broadcastOfficeChanged("team"),
		agents: () => rooms.namedAgents(),
		send: (agent, text) => rooms.tell(agent.terminalId, text),
		lastReply,
		successorOf,
		passedOnInRoom: (fromId, toId, reply) =>
			rooms.passesOn(fromId, toId, reply),
		...(officeCli ? { officeCli } : {}),
	});

	eventBus.onAgentLifecycle((event) => {
		rooms.onAgentEvent(event).catch((error: unknown) => {
			console.warn("[city] relay failed", { error });
		});
		team.onAgentEvent(event).catch((error: unknown) => {
			console.warn("[city] ask relay failed", { error });
		});
	});
	return { rooms, team };
}
