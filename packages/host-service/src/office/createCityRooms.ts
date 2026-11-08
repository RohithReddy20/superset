import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaces } from "../db/schema";
import type { EventBus } from "../events";
import { sendAgentMessage, transcriptSession } from "../terminal/terminal";
import type { TerminalAgentStore } from "../terminal-agents";
import { findResumedSuccessorTerminalId } from "../terminal-agents/persistence";
import {
	type CityAgentInfo,
	CityRooms,
	type CityRoomsDeps,
	lastAnswer,
	MEETING_ROOM,
} from "./cityRooms";

const REPLY_CHARS = 12_000;

/** The city's rooms wired to this host: its agents, workspaces, terminals and lifecycle events. */
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
}): CityRooms {
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
		send: async (agent, text) => {
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
		},
		workspace: (workspaceId) => {
			const row = workspaceRows().find((w) => w.id === workspaceId);
			if (!row?.projectId) return null;
			return {
				projectId: row.projectId,
				name: row.name || row.branch,
				projectName: projectNames().get(row.projectId) || "a project",
				path: row.path,
				branch: row.branch,
			};
		},
		startAgent: async (workspaceId, agent, prompt) => {
			const result = await runAgent({ workspaceId, agent, prompt });
			return { terminalId: result.sessionId };
		},
		lastReply: async (agent) => {
			const result = await transcriptSession({
				terminalId: agent.terminalId,
				workspaceId: agent.workspaceId,
				maxChars: REPLY_CHARS,
				db,
				eventBus,
			});
			return "error" in result ? null : lastAnswer(result.text, result.source);
		},
	});

	eventBus.onAgentLifecycle((event) => {
		rooms.onAgentEvent(event).catch((error: unknown) => {
			console.warn("[city] relay failed", { error });
		});
	});
	return rooms;
}
