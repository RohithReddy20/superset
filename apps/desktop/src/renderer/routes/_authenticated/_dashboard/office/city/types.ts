import type { AppRouter } from "@superset/host-service";
import type { AgentIdentityId } from "@superset/shared/agent-catalog";
import type { inferRouterOutputs } from "@trpc/server";
import type { PaneStatus } from "shared/tabs-types";

/** "lost": its terminal stopped under it, by a restart, a crash or a reboot. */
export type AgentStatus = PaneStatus | "lost";

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
	/** What CLI it is: "Claude", "Codex". */
	kind: string;
	/** Its name in the city, given when it first shows up; a person can rename it. */
	name: string;
	/** What agents write to talk to it, "@ada" without the "@"; empty until the city named it. */
	handle: string;
	status: AgentStatus;
	startedAt: number;
	lastEventAt: number;
	subagents: number;
	/** Where it sits; its workspace's room unless it was seated elsewhere. Its workspace never changes. */
	place: CityPlace;
	/** A question it shows on its screen, such as "trust this folder?", which no hook reports. */
	asking?: { question: string; trust: boolean };
	/** Set when its terminal stopped: whether its conversation can continue in a new one. */
	lost?: { resumable: boolean; reconnecting: boolean };
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

/** What the city map draws as a building: a project, or the office with a floor per room. */
export interface CityBuildingSource {
	id: string;
	name: string;
	color: string | null;
	iconUrl: string | null;
	createdAt: number;
	workspaces: Array<{
		id: string;
		createdAt: number;
		agents: Array<Pick<CityAgent, "status" | "startedAt">>;
	}>;
}

export type CityRoomsSnapshot =
	inferRouterOutputs<AppRouter>["office"]["cityState"];
export type CityRoom = CityRoomsSnapshot["rooms"][number];
export type CityRoomMessage = CityRoom["messages"][number];
export type CityHandover = CityRoomsSnapshot["handovers"][number];
export type OfficeRoomRef = CityRoomsSnapshot["officeRooms"][number];
export type CityTask =
	inferRouterOutputs<AppRouter>["office"]["cityTasks"]["tasks"][number];
export type CityTaskStatus = CityTask["status"];
/** Tasks that still need someone: the agent, its checker, or you. */
export const OPEN_TASK_STATUSES: CityTaskStatus[] = [
	"working",
	"checking",
	"reviewing",
	"ready",
	"pr",
	"blocked",
];
/** The `projectId` of a place in the office rather than a project's building. */
export const OFFICE_PLACE = "office";
