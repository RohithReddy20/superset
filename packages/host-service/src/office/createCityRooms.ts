import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";
import type { EventBus } from "../events";
import {
	disposeSessionAndWait,
	sendAgentMessage,
	transcriptSession,
} from "../terminal/terminal";
import type { TerminalAgentStore } from "../terminal-agents";
import { findResumedSuccessorTerminalId } from "../terminal-agents/persistence";
import {
	type CityAgentInfo,
	CityRooms,
	type CityRoomsDeps,
	lastAnswer,
	MEETING_ROOM,
} from "./cityRooms";
import { CityTasks } from "./cityTasks";

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

	const rooms = new CityRooms({
		statePath,
		agents,
		...(office ? { office } : {}),
		successorOf: (terminalId, workspaceId) =>
			findResumedSuccessorTerminalId(db, workspaceId, terminalId),
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
		stopAgent: async (terminalId) => {
			terminalAgentStore.markTerminalDisposed(terminalId);
			await disposeSessionAndWait(terminalId, db);
		},
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
