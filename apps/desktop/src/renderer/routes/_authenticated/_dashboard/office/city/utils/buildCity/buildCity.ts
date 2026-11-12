import {
	AGENT_IDENTITY_LABELS,
	type AgentIdentityId,
} from "@superset/shared/agent-catalog";
import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses/deriveTerminalAgentStatus";
import type {
	CityAgent,
	CityPlace,
	CityProject,
	CityWorkspace,
} from "../../types";

export interface ProjectRow {
	id: string;
	name: string;
	color: string | null;
	iconUrl: string | null;
	createdAt: number;
	/** The project is on this machine; it is a building even before its first workspace. */
	here?: boolean;
}

export interface WorkspaceRow {
	id: string;
	name: string;
	branch: string | null;
	projectId: string | null;
	hostId: string;
	createdAt: Date | string | number;
	archivedAt?: number | null;
}

export interface BindingRow {
	terminalId: string;
	workspaceId: string;
	agentId: AgentIdentityId;
	startedAt: number;
	lastEventAt: number;
	lastEventType: string;
	subagents?: unknown[];
	chatSessionId?: string;
}

export interface SeatRow extends CityPlace {
	terminalId: string;
}

export interface NameRow {
	terminalId: string;
	name: string;
	handle: string;
	model?: string;
	effort?: string;
}

/** A named agent whose terminal stopped; its binding may be gone already. */
export interface LostRow extends NameRow {
	workspaceId: string;
	agentId: AgentIdentityId;
	startedAt: number;
	since: number;
	resumable: boolean;
	reconnecting?: boolean;
}

/** The projects on this machine, each with its workspaces here and their running agents. */
export function buildCity({
	projects,
	workspaces,
	bindings,
	seats,
	names = [],
	lost = [],
	asks = new Map(),
	seenAt,
	machineId,
}: {
	projects: ProjectRow[];
	workspaces: WorkspaceRow[];
	bindings: BindingRow[];
	seats: SeatRow[];
	names?: NameRow[];
	lost?: LostRow[];
	/** Questions read off agents' screens, by terminal. */
	asks?: ReadonlyMap<string, { question: string; trust: boolean }>;
	seenAt: Record<string, number>;
	machineId: string | null;
}): CityProject[] {
	const local = workspaces.filter(
		(w) => w.projectId && !w.archivedAt && w.hostId === machineId,
	);
	const workspaceById = new Map(local.map((w) => [w.id, w]));
	const seatOf = new Map(seats.map((s) => [s.terminalId, s]));
	const nameOf = new Map(
		[...names, ...lost].map((n) => [n.terminalId, n] as const),
	);
	const lostOf = new Map(lost.map((l) => [l.terminalId, l]));
	const running = new Set(bindings.map((b) => b.terminalId));
	const stopped: BindingRow[] = lost
		.filter((l) => !running.has(l.terminalId))
		.map((l) => ({
			terminalId: l.terminalId,
			workspaceId: l.workspaceId,
			agentId: l.agentId,
			startedAt: l.startedAt,
			lastEventAt: l.since,
			lastEventType: "Stop",
		}));

	const agentsOf = new Map<string, CityAgent[]>();
	const ordered = [...bindings, ...stopped].sort(
		(a, b) => a.startedAt - b.startedAt,
	);
	for (const binding of ordered) {
		const workspace = workspaceById.get(binding.workspaceId);
		if (!workspace?.projectId || binding.chatSessionId) continue;
		const list = agentsOf.get(binding.workspaceId) ?? [];
		const label = AGENT_IDENTITY_LABELS[binding.agentId] ?? binding.agentId;
		const same = list.filter((a) => a.agentId === binding.agentId).length;
		const seat = seatOf.get(binding.terminalId);
		const named = nameOf.get(binding.terminalId);
		const status = deriveTerminalAgentStatus({
			lastEventType: binding.lastEventType,
			lastEventAt: binding.lastEventAt,
			lastSeenAt: seenAt[binding.terminalId],
		});
		const gone = lostOf.get(binding.terminalId);
		const ask =
			status === "failed" || gone ? undefined : asks.get(binding.terminalId);
		list.push({
			terminalId: binding.terminalId,
			workspaceId: binding.workspaceId,
			projectId: workspace.projectId,
			workspaceName: workspace.name,
			agentId: binding.agentId,
			kind: label,
			name: named?.name ?? (same > 0 ? `${label} ${same + 1}` : label),
			handle: named?.handle ?? "",
			...(named?.model ? { model: named.model } : {}),
			...(named?.effort ? { effort: named.effort } : {}),
			status: gone ? "lost" : ask ? "permission" : status,
			...(gone
				? {
						lost: {
							resumable: gone.resumable,
							reconnecting: !!gone.reconnecting,
						},
					}
				: {}),
			...(ask ? { asking: { question: ask.question, trust: ask.trust } } : {}),
			startedAt: binding.startedAt,
			lastEventAt: gone ? gone.since : binding.lastEventAt,
			subagents: binding.subagents?.length ?? 0,
			place: seat
				? { projectId: seat.projectId, roomId: seat.roomId }
				: { projectId: workspace.projectId, roomId: workspace.id },
		});
		agentsOf.set(binding.workspaceId, list);
	}

	const workspacesOf = new Map<string, CityWorkspace[]>();
	for (const w of local) {
		const projectId = w.projectId as string;
		const list = workspacesOf.get(projectId) ?? [];
		list.push({
			id: w.id,
			name: w.name,
			branch: w.branch || null,
			createdAt: new Date(w.createdAt).getTime() || 0,
			agents: agentsOf.get(w.id) ?? [],
		});
		workspacesOf.set(projectId, list);
	}

	return projects.flatMap(({ here, ...p }) => {
		const list = workspacesOf.get(p.id);
		return list || here ? [{ ...p, workspaces: list ?? [] }] : [];
	});
}
