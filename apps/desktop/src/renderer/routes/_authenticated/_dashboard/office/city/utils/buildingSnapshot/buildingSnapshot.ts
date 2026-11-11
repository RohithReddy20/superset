import type { OfficeSnapshot, Teammate } from "../../../types";
import { askingLine, STATUS_LINES } from "../../constants";
import type { CityAgent, CityProject } from "../../types";

export const YOU_ID = "you";
/** Every building's shared room, in the office map's meeting room. */
export const MEETING_ROOM = { id: "meeting", name: "Meeting room" };
/** Not a room on the floor, so you start out in the lounge instead of at a workspace's desk. */
const LOBBY = "lobby";
const LINE_CHARS = 72;
const NEEDS_YOU = new Set(["permission", "failed", "lost"]);

/** What an agent carries on its own list, by terminal id. */
export type Carrying = ReadonlyMap<
	string,
	{ doing: string | null; next: string | null }
>;

/**
 * A building as the office floor draws it: a room per workspace plus the meeting room, and a
 * person per agent sitting in this building, its own or visiting. Visitors carry their workspace in
 * their name.
 */
export function buildingSnapshot(
	project: CityProject,
	present: CityAgent[],
	carrying?: Carrying,
): OfficeSnapshot {
	const rooms = [
		...project.workspaces.map((w) => ({ id: w.id, name: w.name })),
		MEETING_ROOM,
	];
	return {
		teammates: [
			you(),
			...present.map((a) => person(a, carrying?.get(a.terminalId))),
		],
		rooms: rooms.map((room) => ({
			id: room.id,
			name: room.name,
			kind: "room",
			members: present
				.filter((a) => a.place.roomId === room.id)
				.map((a) => a.terminalId),
			...(room.id === MEETING_ROOM.id ? { place: "meeting" } : {}),
		})),
		handoffs: [],
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

const short = (text: string) =>
	text.length > LINE_CHARS ? `${text.slice(0, LINE_CHARS - 1)}…` : text;

/**
 * What needs the person comes first, then the item it works on, then the next one on its list.
 * Plain working and done say nothing: the character and its dot show those.
 */
function lineOf(
	agent: CityAgent,
	carries: { doing: string | null; next: string | null } | undefined,
): string {
	if (agent.asking) return askingLine(agent.asking);
	if (NEEDS_YOU.has(agent.status)) return STATUS_LINES[agent.status];
	if (carries?.doing) return short(carries.doing);
	if (carries?.next && agent.status === "idle")
		return short(`Next: ${carries.next}`);
	return "";
}

function person(
	agent: CityAgent,
	carries?: { doing: string | null; next: string | null },
): Teammate {
	const line = lineOf(agent, carries);
	return {
		id: agent.terminalId,
		name: agent.name,
		kind: "ai",
		role: agent.agentId,
		roomId: agent.place.roomId,
		...(isVisiting(agent) ? { from: agent.workspaceName } : {}),
		joinedAt: agent.startedAt,
		...(agent.agentId === "claude" || agent.agentId === "codex"
			? { engine: agent.agentId }
			: {}),
		presence: agent.lost ? "away" : line ? "focused" : "in-office",
		line,
		lineSince: agent.lastEventAt,
		paused: false,
	};
}
