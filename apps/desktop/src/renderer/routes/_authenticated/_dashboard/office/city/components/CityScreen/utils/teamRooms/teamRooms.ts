import type {
	CityAgent,
	CityNote,
	CityPlace,
	CityProject,
	CityWorkspace,
} from "../../../../types";
import { MEETING_ROOM } from "../../../../utils/buildingSnapshot";
import { roomTalk } from "../../../../utils/roomTalk";

/** A room and who sits in it, wherever they work. */
export interface TeamRoom {
	place: CityPlace;
	name: string;
	project: CityProject;
	/** Unset for a building's meeting room. */
	workspace?: CityWorkspace;
	people: CityAgent[];
}

export const samePlace = (a: CityPlace, b: CityPlace): boolean =>
	a.projectId === b.projectId && a.roomId === b.roomId;

/** Where an agent sits, or its own workspace's room when that seat is gone. */
export function placeOf(
	agent: Pick<CityAgent, "place" | "projectId" | "workspaceId">,
	projects: CityProject[],
): CityPlace {
	const project = projects.find((p) => p.id === agent.place.projectId);
	const known =
		agent.place.roomId === MEETING_ROOM.id ||
		project?.workspaces.some((w) => w.id === agent.place.roomId);
	return project && known
		? agent.place
		: { projectId: agent.projectId, roomId: agent.workspaceId };
}

/**
 * Every workspace room in the city, and a building's meeting room when someone sits in it. People
 * are in name order, so a row stays put when its agent continues in a new terminal.
 */
export function teamRooms(projects: CityProject[]): TeamRoom[] {
	const everyone = projects.flatMap((p) =>
		p.workspaces.flatMap((w) => w.agents),
	);
	const sitting = (place: CityPlace) =>
		everyone
			.filter((a) => samePlace(placeOf(a, projects), place))
			.sort(
				(a, b) =>
					a.name.localeCompare(b.name) ||
					a.terminalId.localeCompare(b.terminalId),
			);

	return projects.flatMap((project) => {
		const rooms: TeamRoom[] = [...project.workspaces]
			.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
			.map((workspace) => {
				const place = { projectId: project.id, roomId: workspace.id };
				return {
					place,
					name: workspace.name,
					project,
					workspace,
					people: sitting(place),
				};
			});
		const meeting = { projectId: project.id, roomId: MEETING_ROOM.id };
		const inMeeting = sitting(meeting);
		if (inMeeting.length > 0)
			rooms.push({
				place: meeting,
				name: MEETING_ROOM.name,
				project,
				people: inMeeting,
			});
		return rooms;
	});
}

/** The room to open when none is picked: where people last talked, else the first with anyone in it. */
export function liveliestRoom(
	rooms: TeamRoom[],
	notes: CityNote[],
): TeamRoom | null {
	const occupied = rooms.filter((r) => r.people.length > 0);
	const lastTalk = (room: TeamRoom) =>
		roomTalk(
			notes,
			room.place,
			new Set(room.people.map((p) => p.terminalId)),
		).reduce((latest, note) => Math.max(latest, note.at), 0);
	return (
		occupied
			.map((room) => ({ room, at: lastTalk(room) }))
			.sort((a, b) => b.at - a.at)[0]?.room ?? null
	);
}
