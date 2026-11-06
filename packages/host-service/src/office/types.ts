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
	/** Spent on budget.day; costUsd counts only engines that report a price. */
	usage?: OfficeUsage;
}

export interface OfficeUsage {
	tokens: number;
	costUsd: number;
	priced: boolean;
}

export interface OfficeRoom {
	id: string;
	name: string;
	kind: "room" | "dm";
	members: string[];
	/** Area of the office floor the room sits in; unset lets the floor pick. */
	place?: string;
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

export type OfficeTaskStatus =
	| "todo"
	| "doing"
	| "review"
	| "verified"
	| "done"
	| "blocked";

export interface OfficeTask {
	id: string;
	title: string;
	brief: string;
	status: OfficeTaskStatus;
	ownerId: string | null;
	verifierId: string | null;
	createdById: string;
	roomId: string;
	threadId: string;
	branch?: string;
	workspacePath?: string;
	check?: { command: string; ok: boolean; output: string; at: number };
	notes: Array<{
		by: string;
		text: string;
		status: OfficeTaskStatus;
		at: number;
	}>;
	rounds: { used: number; max: number };
	usage?: OfficeUsage;
	createdAt: number;
	updatedAt: number;
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
	tasks: OfficeTask[];
	log: OfficeLogLine[];
	project: { repoPath: string; testCommand?: string } | null;
	leadId: string | null;
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
		/** Work plus review sessions one task may use. */
		taskRounds?: number;
	};
	/** The AI teammate that may assign and close tasks like a person. */
	lead?: string;
	/** Who reviews finished tasks when the task names nobody. */
	verifier?: string;
	/** The repository tasks are done in: one git worktree per task. */
	project?: {
		repoPath: string;
		/** Branch new task branches start from; the checkout's current branch when unset. */
		baseBranch?: string;
		/** Run in the task's worktree when the owner reports review; must exit 0. */
		testCommand?: string;
	};
	rooms: Array<{
		id: string;
		name: string;
		kind?: "room" | "dm";
		members: string[];
		place?: string;
	}>;
	humans: Array<{ id: string; name: string; role: string; room: string }>;
	seats: OfficeSeatConfig[];
}
