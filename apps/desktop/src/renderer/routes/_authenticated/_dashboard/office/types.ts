export type EngineId = "claude" | "codex" | "agy";

/** What a person on the floor is doing, shown on the character itself. */
export type Mood =
	| "idle"
	| "working"
	| "needs-you"
	| "done"
	| "failed"
	| "lost"
	| "reconnecting";

/** Someone the floor draws at a desk. */
export interface Teammate {
	id: string;
	name: string;
	kind: "human" | "ai";
	role: string;
	roomId: string;
	/** Where a visitor works, when they sit in a room that is not their own. */
	from?: string;
	/** What their looks are drawn from, when not their id: the same person under a new id keeps their face. */
	look?: string;
	/** When they came; seats are dealt oldest first, so a newcomer never takes someone's desk. */
	joinedAt?: number;
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
