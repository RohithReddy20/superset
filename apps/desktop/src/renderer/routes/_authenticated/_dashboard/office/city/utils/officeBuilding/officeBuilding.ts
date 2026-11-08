import type { OfficeSnapshot, Teammate } from "../../../types";
import type { AgentStatus, CityBuildingSource } from "../../types";
import { OFFICE_PLACE } from "../../types";

const OFFICE_WALL = "#7b6a8c";

/** What an office teammate shows as in the city: busy is working, paused or away is idle. */
export function teammateStatus(
	teammate: Pick<Teammate, "presence" | "paused">,
): AgentStatus {
	if (teammate.paused) return "idle";
	return teammate.presence === "focused" || teammate.presence === "in-meeting"
		? "working"
		: "idle";
}

/** The office as a building of the city: a floor per room, a window per AI teammate living there. */
export function officeBuilding(
	snapshot: Pick<OfficeSnapshot, "rooms" | "teammates">,
): CityBuildingSource {
	const rooms = snapshot.rooms.filter((r) => r.kind === "room");
	return {
		id: OFFICE_PLACE,
		name: "Office",
		color: OFFICE_WALL,
		iconUrl: null,
		createdAt: Number.NEGATIVE_INFINITY,
		workspaces: rooms.map((room, index) => ({
			id: room.id,
			createdAt: index,
			agents: snapshot.teammates
				.filter((t) => t.kind === "ai" && t.roomId === room.id)
				.map((t) => ({ status: teammateStatus(t), startedAt: 0 })),
		})),
	};
}
