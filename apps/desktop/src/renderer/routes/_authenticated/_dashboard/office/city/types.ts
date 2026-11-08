import type { AppRouter } from "@superset/host-service";
import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import type { inferRouterOutputs } from "@trpc/server";
import type { PaneStatus } from "shared/tabs-types";

export type AgentStatus = PaneStatus;

/** A room in a building: a workspace's own room, or the building's meeting room. */
export interface CityPlace {
	projectId: string;
	roomId: string;
}

/** A CLI agent running in one of a workspace's terminals. */
export interface CityAgent {
	terminalId: string;
	workspaceId: string;
	projectId: string;
	workspaceName: string;
	agentId: AgentIdentityId;
	/** "Claude", or "Claude 2" when a workspace runs more than one. */
	name: string;
	status: AgentStatus;
	startedAt: number;
	lastEventAt: number;
	subagents: number;
	/** Where it sits; its workspace's room unless it was seated elsewhere. Its workspace never changes. */
	place: CityPlace;
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

export type CityRoomsSnapshot =
	inferRouterOutputs<AppRouter>["office"]["cityState"];
export type CityRoom = CityRoomsSnapshot["rooms"][number];
export type CityRoomMessage = CityRoom["messages"][number];
export type CityHandover = CityRoomsSnapshot["handovers"][number];
