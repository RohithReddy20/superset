export type OfficePresence = "away" | "in-office" | "focused" | "in-meeting";
export type OfficeEngine = "claude" | "codex" | "agy";

export interface OfficeTeammate {
	id: string;
	name: string;
	kind: "human" | "ai";
	role: string;
	roomId: string;
	engine?: OfficeEngine;
	model?: string;
	presence: OfficePresence;
	line: string;
	lineSince: number;
	paused: boolean;
	budget: { dailyTurns: number; usedToday: number; day: string };
}

export interface OfficeRoom {
	id: string;
	name: string;
	kind: "room" | "dm";
	members: string[];
}

export interface OfficeMessage {
	id: string;
	roomId: string;
	threadId: string | null;
	authorId: string;
	text: string;
	mentions: string[];
	kind: "chat" | "system";
	depth: number;
	ts: number;
}

export interface OfficeHandoff {
	id: string;
	fromId: string;
	toId: string;
	roomId: string;
	threadId: string;
	depth: number;
	text: string;
	status: "working" | "answered" | "held" | "canceled";
	reason?: string;
	createdAt: number;
	answeredAt?: number;
}

export interface OfficeLogLine {
	seatId: string;
	text: string;
	ts: number;
}

export interface OfficeSnapshot {
	started: boolean;
	teammates: OfficeTeammate[];
	rooms: OfficeRoom[];
	messages: OfficeMessage[];
	handoffs: OfficeHandoff[];
	log: OfficeLogLine[];
}

export interface OfficeSeatConfig {
	id: string;
	name: string;
	role: string;
	room: string;
	engine: OfficeEngine;
	model?: string;
	instructions?: string;
	dailyTurns?: number;
}

export interface OfficeConfig {
	limits?: {
		maxDepth?: number;
		maxAiRoundsWithoutHuman?: number;
		maxAsksPerTurn?: number;
		dailyTurns?: number;
	};
	rooms: Array<{
		id: string;
		name: string;
		kind?: "room" | "dm";
		members: string[];
	}>;
	humans: Array<{ id: string; name: string; role: string; room: string }>;
	seats: OfficeSeatConfig[];
}
