import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";
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
	type CityRoomsDeps,
	type LostAgent,
	lastAnswer,
	MEETING_ROOM,
} from "./cityRooms";
import { CityTasks } from "./cityTasks";
import { TerminalWatch } from "./terminalWatch";

const REPLY_CHARS = 12_000;
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;
const run = promisify(execFile);

/**
 * The city's rooms and tasks wired to this host: its agents, workspaces, terminals and lifecycle
 * events. Tasks keep their state next to the rooms' state file.
 */
export function createCityRooms({
	db,
	eventBus,
	terminalAgentStore,
	statePath,
	runAgent,
	resumeAgent,
	office,
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
	/** The office, so agents can sit in its rooms next to its own teammates. */
	office?: CityRoomsDeps["office"];
}): { rooms: CityRooms; tasks: CityTasks } {
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
		...(office ? { office } : {}),
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

	const tasks = new CityTasks({
		statePath: join(dirname(statePath), "city-tasks.json"),
		agents: () => rooms.namedAgents(),
		workspace: workspaceOf,
		send,
		lastReply,
		startChecker: (workspaceId, agent, prompt) =>
			rooms.start({ workspaceId, agent, prompt }),
		stopAgent,
		successorOf,
		runCheck: async (command, cwd) => {
			try {
				const { stdout, stderr } = await run("sh", ["-lc", command], {
					cwd,
					timeout: CHECK_TIMEOUT_MS,
					maxBuffer: 16 * 1024 * 1024,
				});
				return { ok: true, output: `${stdout}\n${stderr}` };
			} catch (error) {
				const e = error as {
					stdout?: string;
					stderr?: string;
					message: string;
				};
				return {
					ok: false,
					output: `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message}`,
				};
			}
		},
		headOf: async (cwd) => {
			try {
				const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd });
				return stdout.trim() || null;
			} catch {
				return null;
			}
		},
	});

	eventBus.onAgentLifecycle((event) => {
		rooms.onAgentEvent(event).catch((error: unknown) => {
			console.warn("[city] relay failed", { error });
		});
		tasks.onAgentEvent(event).catch((error: unknown) => {
			console.warn("[city] task step failed", { error });
		});
	});
	return { rooms, tasks };
}
