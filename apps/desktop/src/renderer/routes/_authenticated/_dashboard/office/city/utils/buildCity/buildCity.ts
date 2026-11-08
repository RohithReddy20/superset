import {
	AGENT_IDENTITY_LABELS,
	type AgentIdentityId,
} from "@superset/shared/agent-catalog";
import { deriveTerminalAgentStatus } from "renderer/hooks/host-service/useTerminalAgentStatuses/deriveTerminalAgentStatus";
import type { CityAgent, CityProject, CityWorkspace } from "../../types";

export interface ProjectRow {
	id: string;
	name: string;
	color: string | null;
	iconUrl: string | null;
	createdAt: number;
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
}

/** This machine's projects that have a workspace here, each with its workspaces and running agents. */
export function buildCity({
	projects,
	workspaces,
	bindings,
	seenAt,
	machineId,
}: {
	projects: ProjectRow[];
	workspaces: WorkspaceRow[];
	bindings: BindingRow[];
	seenAt: Record<string, number>;
	machineId: string | null;
}): CityProject[] {
	const agentsOf = new Map<string, CityAgent[]>();
	const ordered = [...bindings].sort((a, b) => a.startedAt - b.startedAt);
	for (const binding of ordered) {
		const list = agentsOf.get(binding.workspaceId) ?? [];
		const label = AGENT_IDENTITY_LABELS[binding.agentId] ?? binding.agentId;
		const same = list.filter((a) => a.agentId === binding.agentId).length;
		list.push({
			terminalId: binding.terminalId,
			workspaceId: binding.workspaceId,
			agentId: binding.agentId,
			name: same > 0 ? `${label} ${same + 1}` : label,
			status: deriveTerminalAgentStatus({
				lastEventType: binding.lastEventType,
				lastEventAt: binding.lastEventAt,
				lastSeenAt: seenAt[binding.terminalId],
			}),
			startedAt: binding.startedAt,
			lastEventAt: binding.lastEventAt,
			subagents: binding.subagents?.length ?? 0,
		});
		agentsOf.set(binding.workspaceId, list);
	}

	const workspacesOf = new Map<string, CityWorkspace[]>();
	for (const w of workspaces) {
		if (!w.projectId || w.archivedAt || w.hostId !== machineId) continue;
		const list = workspacesOf.get(w.projectId) ?? [];
		list.push({
			id: w.id,
			name: w.name,
			branch: w.branch || null,
			createdAt: new Date(w.createdAt).getTime() || 0,
			agents: agentsOf.get(w.id) ?? [],
		});
		workspacesOf.set(w.projectId, list);
	}

	return projects.flatMap((p) => {
		const list = workspacesOf.get(p.id);
		return list ? [{ ...p, workspaces: list }] : [];
	});
}
