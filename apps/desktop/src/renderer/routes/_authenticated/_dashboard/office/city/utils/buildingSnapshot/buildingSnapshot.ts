import type { OfficeSnapshot, Teammate } from "../../../types";
import { askingLine, STATUS_LINES } from "../../constants";
import type { CityAgent, CityProject } from "../../types";

export const YOU_ID = "you";
/** Every building's shared room, in the office map's meeting room. */
export const MEETING_ROOM = { id: "meeting", name: "Meeting room" };
/** Not a room on the floor, so you start out in the lounge instead of at a workspace's desk. */
const LOBBY = "lobby";
const VISITOR_TAG_CHARS = 14;

/**
 * A building as the office floor draws it: a room per workspace plus the meeting room, and a
 * person per agent sitting in this building, its own or visiting. Visitors carry their workspace in
 * their name.
 */
export function buildingSnapshot(
	project: CityProject,
	present: CityAgent[],
): OfficeSnapshot {
	const rooms = [
		...project.workspaces.map((w) => ({ id: w.id, name: w.name })),
		MEETING_ROOM,
	];
	return {
		started: true,
		teammates: [you(), ...present.map(person)],
		rooms: rooms.map((room) => ({
			id: room.id,
			name: room.name,
			kind: "room",
			members: present
				.filter((a) => a.place.roomId === room.id)
				.map((a) => a.terminalId),
			...(room.id === MEETING_ROOM.id ? { place: "meeting" } : {}),
		})),
		messages: [],
		handoffs: [],
		tasks: [],
		log: [],
		project: null,
		leadId: null,
	};
}

/** Agents sitting in this building: its own that stayed, and visitors from anywhere in the city. */
export function presentIn(
	projectId: string,
	everyone: CityAgent[],
): CityAgent[] {
	return everyone.filter((a) => a.place.projectId === projectId);
}

export function isVisiting(agent: CityAgent): boolean {
	return (
		agent.place.projectId !== agent.projectId ||
		agent.place.roomId !== agent.workspaceId
	);
}

function you(): Teammate {
	return {
		id: YOU_ID,
		name: "You",
		kind: "human",
		role: "",
		roomId: LOBBY,
		presence: "in-office",
		line: "",
		lineSince: 0,
		paused: false,
	};
}

function person(agent: CityAgent): Teammate {
	const line = agent.asking
		? askingLine(agent.asking)
		: STATUS_LINES[agent.status];
	const from =
		agent.workspaceName.length > VISITOR_TAG_CHARS
			? `${agent.workspaceName.slice(0, VISITOR_TAG_CHARS - 1)}…`
			: agent.workspaceName;
	return {
		id: agent.terminalId,
		name: isVisiting(agent) ? `${agent.name} · ${from}` : agent.name,
		kind: "ai",
		role: agent.agentId,
		roomId: agent.place.roomId,
		...(agent.agentId === "claude" || agent.agentId === "codex"
			? { engine: agent.agentId }
			: {}),
		presence: agent.lost ? "away" : line ? "focused" : "in-office",
		line,
		lineSince: agent.lastEventAt,
		paused: false,
	};
}
