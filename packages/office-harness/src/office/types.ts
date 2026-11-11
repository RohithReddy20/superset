export type Presence = "away" | "in-office" | "focused" | "in-meeting";

export type EngineId = "claude" | "codex" | "agy";

/** Tokens spent and dollars reported; `priced` is false while no engine has reported a price. */
export interface Usage {
	tokens: number;
	costUsd: number;
	priced: boolean;
}

/** A seat on the office floor map: the floor picks it, the office keeps it across restarts. */
export interface Desk {
	zoneId: string;
	x: number;
	y: number;
}

export interface Teammate {
	id: string;
	name: string;
	kind: "human" | "ai";
	role: string;
	roomId: string;
	engine?: EngineId;
	model?: string;
	instructions?: string;
	presence: Presence;
	line: string;
	lineSince: number;
	paused: boolean;
	/** The day `usage` counts for. */
	usageDay?: string;
	usage?: Usage;
	desk?: Desk;
	acpSessionId?: string;
}

export interface Room {
	id: string;
	name: string;
	kind: "room" | "dm";
	members: string[];
	/** Where the room sits on the office floor (an area of the floor map); the floor picks one when unset. */
	place?: string;
}

export interface Message {
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

export type HandoffStatus = "working" | "answered" | "held" | "canceled";

export interface Handoff {
	id: string;
	fromId: string;
	toId: string;
	rootMessageId: string;
	roomId: string;
	threadId: string;
	depth: number;
	text: string;
	status: HandoffStatus;
	reason?: string;
	createdAt: number;
	answeredAt?: number;
}

export type TaskStatus =
	| "todo"
	| "doing"
	| "review"
	| "verified"
	| "done"
	| "blocked";

export interface TaskNote {
	by: string;
	text: string;
	status: TaskStatus;
	at: number;
}

export interface TaskCheck {
	command: string;
	ok: boolean;
	output: string;
	at: number;
}

/** One owned piece of work. Everything about it is said in its thread. */
export interface Task {
	id: string;
	title: string;
	brief: string;
	status: TaskStatus;
	ownerId: string | null;
	verifierId: string | null;
	createdById: string;
	roomId: string;
	threadId: string;
	branch?: string;
	workspacePath?: string;
	check?: TaskCheck;
	notes: TaskNote[];
	usage?: Usage;
	createdAt: number;
	updatedAt: number;
}

export interface InboxItem {
	message: Message;
	reason: "mention" | "thread" | "dm";
	depth: number;
}

export interface OfficeState {
	teammates: Teammate[];
	rooms: Room[];
	messages: Message[];
	handoffs: Handoff[];
	tasks: Task[];
}

export type OfficeEvent =
	| { type: "snapshot"; state: OfficeState }
	| { type: "message"; message: Message }
	| { type: "teammate"; teammate: Teammate }
	| { type: "handoff"; handoff: Handoff }
	| {
			type: "task";
			task: Task;
			change: "created" | "assigned" | "status" | "usage";
	  }
	| { type: "log"; seatId: string; text: string; ts: number };

export const replyTarget = (roomId: string, threadId: string | null) =>
	threadId ? `room:${roomId}/thread:${threadId}` : `room:${roomId}`;

export function parseReplyTarget(
	target: string,
): { roomId: string; threadId: string | null } | null {
	const match = /^room:([^/\s]+)(?:\/thread:([^/\s]+))?$/.exec(target.trim());
	if (!match) return null;
	return { roomId: match[1] ?? "", threadId: match[2] ?? null };
}
