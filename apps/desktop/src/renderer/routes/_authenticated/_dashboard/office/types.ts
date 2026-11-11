export type EngineId = "claude" | "codex" | "agy";

/** Someone the floor draws at a desk. */
export interface Teammate {
	id: string;
	name: string;
	kind: "human" | "ai";
	role: string;
	roomId: string;
	engine?: EngineId;
	presence: "away" | "in-office" | "focused" | "in-meeting";
	line: string;
	lineSince: number;
	paused: boolean;
	desk?: { zoneId: string; x: number; y: number };
}

/** A room of the floor and who sits in it. */
export interface Room {
	id: string;
	name: string;
	kind: "room" | "dm";
	members: string[];
	/** Area of the floor the room sits in; unset lets the floor pick. */
	place?: string;
}

/** Two teammates the floor shows as meeting. */
export interface Handoff {
	id: string;
	fromId: string;
	toId: string;
	status: "working" | "answered" | "held" | "canceled";
}

/** What the floor draws: one building's rooms and the people in them. */
export interface OfficeSnapshot {
	teammates: Teammate[];
	rooms: Room[];
	handoffs: Handoff[];
}
