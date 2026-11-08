import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import type { PaneStatus } from "shared/tabs-types";

export type AgentStatus = PaneStatus;

/** A CLI agent running in one of a workspace's terminals. */
export interface CityAgent {
	terminalId: string;
	workspaceId: string;
	agentId: AgentIdentityId;
	/** "Claude", or "Claude 2" when a workspace runs more than one. */
	name: string;
	status: AgentStatus;
	startedAt: number;
	lastEventAt: number;
	subagents: number;
}

export interface CityWorkspace {
	id: string;
	name: string;
	branch: string | null;
	createdAt: number;
	agents: CityAgent[];
}

/** A project on this machine; the city draws it as one building. */
export interface CityProject {
	id: string;
	name: string;
	color: string | null;
	iconUrl: string | null;
	createdAt: number;
	workspaces: CityWorkspace[];
}
