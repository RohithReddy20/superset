import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkDelivery, DEFAULT_LIMITS, type Limits } from "../guards/guards";
import type {
	Desk,
	Handoff,
	InboxItem,
	Message,
	OfficeEvent,
	OfficeState,
	Presence,
	Room,
	Task,
	TaskStatus,
	Teammate,
	Usage,
} from "./types";

const today = () => new Date().toISOString().slice(0, 10);

function addUsage(
	total: Usage | undefined,
	turn: { tokens: number; costUsd: number | null },
): Usage {
	return {
		tokens: (total?.tokens ?? 0) + turn.tokens,
		costUsd: (total?.costUsd ?? 0) + (turn.costUsd ?? 0),
		priced: (total?.priced ?? false) || turn.costUsd !== null,
	};
}

const shortId = () => Math.random().toString(36).slice(2, 10);

export interface OfficeOptions {
	statePath: string;
	limits?: Partial<Limits>;
	/** The AI teammate allowed to assign and close tasks like a person. */
	leadId?: string;
	/** Work plus review sessions one task may use before it is blocked. */
	maxTaskRounds?: number;
}

const DEFAULT_TASK_ROUNDS = 6;

/** Who may move a task to which status. */
const OWNER_STATUSES: TaskStatus[] = ["doing", "review", "blocked"];
const VERIFIER_STATUSES: TaskStatus[] = ["verified", "doing", "blocked"];

/**
 * The shared office: who is here, the rooms, every message, and every
 * hand-off between AI teammates. It decides who receives a message
 * (the inbox) and applies the guards; seats only read their inbox and post.
 */
export class Office {
	readonly limits: Limits;
	private readonly state: OfficeState = {
		teammates: [],
		rooms: [],
		messages: [],
		handoffs: [],
		tasks: [],
	};
	private readonly listeners = new Set<(event: OfficeEvent) => void>();
	private readonly inboxes = new Map<string, (item: InboxItem) => void>();
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly options: OfficeOptions) {
		this.limits = { ...DEFAULT_LIMITS, ...options.limits };
		this.load();
	}

	snapshot(): OfficeState {
		return structuredClone(this.state);
	}

	subscribe(listener: (event: OfficeEvent) => void): () => void {
		this.listeners.add(listener);
		listener({ type: "snapshot", state: this.snapshot() });
		return () => this.listeners.delete(listener);
	}

	log(seatId: string, text: string): void {
		this.emit({ type: "log", seatId, text, ts: Date.now() });
	}

	upsertTeammate(
		input: Omit<
			Teammate,
			"presence" | "line" | "lineSince" | "paused" | "budget"
		> & { dailyTurns?: number },
	): Teammate {
		const existing = this.teammate(input.id);
		const teammate: Teammate = {
			...(existing ?? {
				presence: "away" as Presence,
				line: "",
				lineSince: Date.now(),
				paused: false,
				budget: {
					dailyTurns: input.dailyTurns ?? this.limits.dailyTurns,
					usedToday: 0,
					day: today(),
				},
			}),
			...input,
		};
		if (input.dailyTurns) teammate.budget.dailyTurns = input.dailyTurns;
		if (existing) Object.assign(existing, teammate);
		else this.state.teammates.push(teammate);
		this.emit({ type: "teammate", teammate: structuredClone(teammate) });
		return teammate;
	}

	upsertRoom(room: Room): Room {
		const existing = this.state.rooms.find((r) => r.id === room.id);
		if (existing) Object.assign(existing, room);
		else this.state.rooms.push(room);
		this.save();
		return existing ?? room;
	}

	/**
	 * Deletes a room with its messages and hand-offs. Whoever lived there moves to another room
	 * they are in, else to the first room. Returns those moves.
	 */
	removeRoom(id: string): { teammateId: string; roomId: string }[] {
		const room = this.room(id);
		if (!room) throw new Error(`No room ${id}`);
		if (room.kind === "dm")
			throw new Error(`${room.name} is a group chat, not a room`);
		const others = this.state.rooms.filter(
			(r) => r.kind === "room" && r.id !== id,
		);
		const first = others[0];
		if (!first) throw new Error(`${room.name} is the last room`);
		const task = this.state.tasks.find((t) => t.roomId === id);
		if (task) throw new Error(`${task.id} keeps its thread in ${room.name}`);

		const moves: { teammateId: string; roomId: string }[] = [];
		for (const teammate of this.state.teammates) {
			if (teammate.roomId !== id) continue;
			const next = others.find((r) => r.members.includes(teammate.id)) ?? first;
			if (!next.members.includes(teammate.id)) next.members.push(teammate.id);
			teammate.roomId = next.id;
			moves.push({ teammateId: teammate.id, roomId: next.id });
			this.emit({ type: "teammate", teammate: structuredClone(teammate) });
		}
		this.state.rooms = this.state.rooms.filter((r) => r.id !== id);
		this.state.messages = this.state.messages.filter((m) => m.roomId !== id);
		this.state.handoffs = this.state.handoffs.filter((h) => h.roomId !== id);
		this.save();
		return moves;
	}

	teammate(id: string): Teammate | undefined {
		return this.state.teammates.find((t) => t.id === id);
	}

	teammateByName(name: string): Teammate | undefined {
		const wanted = name.trim().toLowerCase();
		return this.state.teammates.find(
			(t) => t.id.toLowerCase() === wanted || t.name.toLowerCase() === wanted,
		);
	}

	teammates(): Teammate[] {
		return this.state.teammates;
	}

	rooms(): Room[] {
		return this.state.rooms;
	}

	room(id: string): Room | undefined {
		return this.state.rooms.find((r) => r.id === id);
	}

	message(id: string): Message | undefined {
		return this.state.messages.find((m) => m.id === id);
	}

	thread(roomId: string, threadId: string): Message[] {
		return this.state.messages.filter(
			(m) =>
				m.roomId === roomId && (m.id === threadId || m.threadId === threadId),
		);
	}

	recent(roomId: string, limit = 30): Message[] {
		return this.state.messages
			.filter((m) => m.roomId === roomId && m.threadId === null)
			.slice(-limit);
	}

	openHandoffsFrom(teammateId: string): Handoff[] {
		return this.state.handoffs.filter(
			(h) => h.fromId === teammateId && h.status === "working",
		);
	}

	openHandoffsTo(teammateId: string): Handoff[] {
		return this.state.handoffs.filter(
			(h) => h.toId === teammateId && h.status === "working",
		);
	}

	setPresence(id: string, presence: Presence, line?: string): void {
		const teammate = this.teammate(id);
		if (!teammate) return;
		teammate.presence = presence;
		if (line !== undefined && line !== teammate.line) {
			teammate.line = line;
			teammate.lineSince = Date.now();
		}
		this.emit({ type: "teammate", teammate: structuredClone(teammate) });
	}

	setLine(id: string, line: string): void {
		const teammate = this.teammate(id);
		if (!teammate) return;
		teammate.line = line;
		teammate.lineSince = Date.now();
		this.emit({ type: "teammate", teammate: structuredClone(teammate) });
	}

	setPaused(id: string, paused: boolean): void {
		const teammate = this.teammate(id);
		if (!teammate) return;
		teammate.paused = paused;
		this.emit({ type: "teammate", teammate: structuredClone(teammate) });
	}

	setDesk(id: string, desk: Desk): void {
		const teammate = this.teammate(id);
		const { zoneId, x, y } = desk;
		const same =
			teammate?.desk?.zoneId === zoneId &&
			teammate.desk.x === x &&
			teammate.desk.y === y;
		if (!teammate || same) return;
		teammate.desk = { zoneId, x, y };
		this.emit({ type: "teammate", teammate: structuredClone(teammate) });
	}

	rememberSession(id: string, acpSessionId: string | undefined): void {
		const teammate = this.teammate(id);
		if (!teammate) return;
		teammate.acpSessionId = acpSessionId;
		this.save();
	}

	/** Counts one turn against today's budget; false when the budget is spent. */
	spendTurn(id: string): boolean {
		const teammate = this.teammate(id);
		if (!teammate) return false;
		this.startDay(teammate);
		if (teammate.budget.usedToday >= teammate.budget.dailyTurns) return false;
		teammate.budget.usedToday += 1;
		this.emit({ type: "teammate", teammate: structuredClone(teammate) });
		return true;
	}

	/** Adds one turn's tokens and reported cost to the teammate's day and, for task sessions, to the task. */
	recordUsage(
		teammateId: string,
		turn: { tokens: number; costUsd: number | null },
		taskId?: string,
	): void {
		const teammate = this.teammate(teammateId);
		if (teammate) {
			this.startDay(teammate);
			teammate.usage = addUsage(teammate.usage, turn);
			this.emit({ type: "teammate", teammate: structuredClone(teammate) });
		}
		const task = taskId ? this.task(taskId) : undefined;
		if (task) {
			task.usage = addUsage(task.usage, turn);
			this.emit({ type: "task", task: structuredClone(task), change: "usage" });
		}
	}

	private startDay(teammate: Teammate): void {
		if (teammate.budget.day === today()) return;
		teammate.budget.day = today();
		teammate.budget.usedToday = 0;
		teammate.usage = undefined;
	}

	onInbox(teammateId: string, receive: (item: InboxItem) => void): void {
		this.inboxes.set(teammateId, receive);
	}

	tasks(): Task[] {
		return this.state.tasks;
	}

	task(id: string): Task | undefined {
		return this.state.tasks.find((t) => t.id === id);
	}

	/** A person, the lead, or nobody else may assign and close tasks. */
	isLead(id: string): boolean {
		return this.teammate(id)?.kind === "human" || id === this.options.leadId;
	}

	/**
	 * Opens a task. Without a thread it starts one in the room with the task as
	 * the root message, so every question and report about it lands in one place.
	 */
	createTask(input: {
		title: string;
		brief: string;
		by: string;
		roomId: string;
		threadId?: string | null;
		ownerId?: string | null;
		verifierId?: string | null;
	}): Task {
		const author = this.teammate(input.by);
		if (!author) throw new Error(`Unknown teammate ${input.by}`);
		const id = `T-${this.state.tasks.length + 1}`;
		const title = input.title.trim();
		let threadId = input.threadId ?? null;
		if (threadId && !this.message(threadId))
			throw new Error(`No thread ${threadId}`);
		if (!threadId) {
			const { message } = this.post({
				authorId: input.by,
				roomId: input.roomId,
				text: `${id}: ${title}`,
				kind: "system",
			});
			threadId = message.id;
		}
		const now = Date.now();
		const task: Task = {
			id,
			title,
			brief: input.brief.trim(),
			status: "todo",
			ownerId: null,
			verifierId: input.verifierId ?? null,
			createdById: input.by,
			roomId: input.roomId,
			threadId,
			notes: [],
			rounds: {
				used: 0,
				max: this.options.maxTaskRounds ?? DEFAULT_TASK_ROUNDS,
			},
			createdAt: now,
			updatedAt: now,
		};
		this.state.tasks.push(task);
		this.emit({ type: "task", task: structuredClone(task), change: "created" });
		if (input.ownerId) this.assignTask(id, input.ownerId, input.by);
		return task;
	}

	assignTask(id: string, ownerId: string, by: string): Task {
		const task = this.task(id);
		if (!task) throw new Error(`No task ${id}`);
		const owner = this.teammate(ownerId);
		if (!owner) throw new Error(`Unknown teammate ${ownerId}`);
		const mayAssign =
			this.isLead(by) || (task.ownerId === null && task.createdById === by);
		if (!mayAssign)
			throw new Error(`${this.teammate(by)?.name ?? by} may not assign ${id}`);
		if (task.verifierId === ownerId) task.verifierId = null;
		task.ownerId = ownerId;
		if (task.status === "done") throw new Error(`${id} is already done`);
		task.status = "todo";
		task.updatedAt = Date.now();
		this.note(task, by, `assigned to ${owner.name}`);
		this.emit({
			type: "task",
			task: structuredClone(task),
			change: "assigned",
		});
		return task;
	}

	setTaskVerifier(id: string, verifierId: string | null): void {
		const task = this.task(id);
		if (!task) throw new Error(`No task ${id}`);
		task.verifierId = verifierId;
		this.save();
	}

	setTaskWorkspace(
		id: string,
		workspace: { path: string; branch: string },
	): void {
		const task = this.task(id);
		if (!task) return;
		task.workspacePath = workspace.path;
		task.branch = workspace.branch;
		this.save();
	}

	recordTaskCheck(id: string, check: Task["check"]): void {
		const task = this.task(id);
		if (!task) return;
		task.check = check;
		this.save();
	}

	/** Counts one work or review session; false when the task has used its rounds. */
	spendTaskRound(id: string): boolean {
		const task = this.task(id);
		if (!task) return false;
		if (task.rounds.used >= task.rounds.max) return false;
		task.rounds.used += 1;
		this.save();
		return true;
	}

	/**
	 * Moves a task. Owners report doing, review or blocked; the verifier says
	 * verified or sends it back to doing; a person or the lead may do anything,
	 * and only they may close it.
	 */
	updateTask(
		id: string,
		input: { status: TaskStatus; note: string },
		by: string,
		options: { force?: boolean } = {},
	): Task {
		const task = this.task(id);
		if (!task) throw new Error(`No task ${id}`);
		const actor = this.teammate(by);
		if (!actor) throw new Error(`Unknown teammate ${by}`);
		const allowed =
			options.force || this.isLead(by)
				? true
				: by === task.ownerId && OWNER_STATUSES.includes(input.status)
					? true
					: by === task.verifierId && VERIFIER_STATUSES.includes(input.status);
		if (!allowed)
			throw new Error(
				`${actor.name} may not move ${id} to ${input.status}` +
					(by === task.ownerId
						? `; an owner reports doing, review or blocked`
						: by === task.verifierId
							? `; a verifier says verified, or doing with what must change`
							: ""),
			);
		if (
			by === task.verifierId &&
			input.status === "verified" &&
			task.status !== "review"
		)
			throw new Error(`${id} is ${task.status}, not in review`);
		task.status = input.status;
		task.updatedAt = Date.now();
		this.note(task, by, input.note);
		this.emit({ type: "task", task: structuredClone(task), change: "status" });
		return task;
	}

	private note(task: Task, by: string, text: string): void {
		task.notes.push({
			by,
			text: text.trim(),
			status: task.status,
			at: Date.now(),
		});
		const who = this.teammate(by)?.name ?? by;
		this.post({
			authorId: by,
			roomId: task.roomId,
			threadId: task.threadId,
			text: `${who} · ${task.id} ${task.status}: ${text.trim()}`,
			kind: "system",
		});
	}

	/**
	 * Posts a message and delivers it. `depth` is how many AI hops the author
	 * is from the person who started the chain: 0 for a person.
	 */
	post({
		authorId,
		roomId,
		threadId,
		text,
		depth = 0,
		kind = "chat",
	}: {
		authorId: string;
		roomId: string;
		threadId?: string | null;
		text: string;
		depth?: number;
		kind?: "chat" | "system";
	}): { message: Message; held: Handoff[] } {
		const author = this.teammate(authorId);
		const room = this.room(roomId);
		if (!author) throw new Error(`Unknown teammate ${authorId}`);
		if (!room) throw new Error(`Unknown room ${roomId}`);
		if (kind === "chat" && !room.members.includes(authorId))
			throw new Error(`${author.name} is not in ${room.name}`);
		const root = threadId ? this.message(threadId) : null;
		if (threadId && (!root || root.roomId !== roomId))
			throw new Error(`No thread ${threadId} in ${room.name}`);

		const message: Message = {
			id: shortId(),
			roomId,
			threadId: root ? (root.threadId ?? root.id) : null,
			authorId,
			text: text.trim(),
			mentions: this.mentionsIn(text).filter((id) => id !== authorId),
			kind,
			depth: author.kind === "human" ? 0 : depth,
			ts: Date.now(),
		};
		this.state.messages.push(message);
		this.emit({ type: "message", message: structuredClone(message) });
		const held = kind === "chat" ? this.deliver(message, author, room) : [];
		this.save();
		return { message, held };
	}

	answerHandoffs(fromId: string, toId: string, threadId: string): void {
		for (const handoff of this.state.handoffs) {
			if (
				handoff.status === "working" &&
				handoff.fromId === toId &&
				handoff.toId === fromId &&
				handoff.threadId === threadId
			) {
				handoff.status = "answered";
				handoff.answeredAt = Date.now();
				this.emit({ type: "handoff", handoff: structuredClone(handoff) });
			}
		}
	}

	cancelHandoffs(threadId: string, byId: string): Handoff[] {
		const canceled: Handoff[] = [];
		for (const handoff of this.state.handoffs) {
			if (handoff.threadId === threadId && handoff.status === "working") {
				handoff.status = "canceled";
				handoff.reason = `stopped by ${this.teammate(byId)?.name ?? byId}`;
				canceled.push(handoff);
				this.emit({ type: "handoff", handoff: structuredClone(handoff) });
			}
		}
		this.save();
		return canceled;
	}

	private deliver(message: Message, author: Teammate, room: Room): Handoff[] {
		const held: Handoff[] = [];
		const threadRootId = message.threadId ?? message.id;
		const thread = this.thread(room.id, threadRootId);
		const participants = new Set<string>();
		for (const earlier of thread) {
			if (earlier.id === message.id) continue;
			participants.add(earlier.authorId);
			for (const id of earlier.mentions) participants.add(id);
		}

		for (const target of this.state.teammates) {
			if (target.kind !== "ai" || target.id === author.id) continue;
			if (!room.members.includes(target.id)) continue;
			let reason: InboxItem["reason"] | null = null;
			if (message.mentions.includes(target.id)) reason = "mention";
			else if (author.kind === "human" && room.kind === "dm") reason = "dm";
			else if (
				author.kind === "human" &&
				message.threadId &&
				participants.has(target.id)
			)
				reason = "thread";
			if (author.kind === "ai" && message.threadId)
				this.answerHandoffs(author.id, target.id, threadRootId);
			if (!reason) continue;

			const depth = author.kind === "human" ? 0 : message.depth + 1;
			const verdict = checkDelivery({
				limits: this.limits,
				author,
				target,
				message,
				depth,
				thread,
			});
			const handoff: Handoff | null =
				author.kind === "ai"
					? {
							id: shortId(),
							fromId: author.id,
							toId: target.id,
							rootMessageId: threadRootId,
							roomId: room.id,
							threadId: threadRootId,
							depth,
							text: message.text,
							status: verdict.ok ? "working" : "held",
							reason: verdict.ok ? undefined : verdict.reason,
							createdAt: Date.now(),
						}
					: null;
			if (handoff) {
				this.state.handoffs.push(handoff);
				this.emit({ type: "handoff", handoff: structuredClone(handoff) });
			}
			if (!verdict.ok) {
				if (handoff) held.push(handoff);
				this.post({
					authorId: author.id,
					roomId: room.id,
					threadId: threadRootId,
					text: `(held) ${target.name} did not get this: ${verdict.reason}.`,
					kind: "system",
				});
				continue;
			}
			this.inboxes.get(target.id)?.({ message, reason, depth });
		}
		return held;
	}

	private mentionsIn(text: string): string[] {
		const ids = new Set<string>();
		for (const match of text.matchAll(/@([\w-]+)/g)) {
			const teammate = this.teammateByName(match[1] ?? "");
			if (teammate) ids.add(teammate.id);
		}
		return [...ids];
	}

	private emit(event: OfficeEvent): void {
		for (const listener of this.listeners) listener(event);
		if (event.type !== "log") this.save();
	}

	private load(): void {
		try {
			const raw = readFileSync(this.options.statePath, "utf8");
			const saved = JSON.parse(raw) as Partial<OfficeState>;
			this.state.teammates = saved.teammates ?? [];
			this.state.rooms = saved.rooms ?? [];
			this.state.messages = saved.messages ?? [];
			this.state.handoffs = saved.handoffs ?? [];
			this.state.tasks = saved.tasks ?? [];
			for (const teammate of this.state.teammates) {
				teammate.presence = "away";
			}
		} catch {}
	}

	private save(): void {
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			mkdirSync(dirname(this.options.statePath), { recursive: true });
			writeFileSync(
				this.options.statePath,
				JSON.stringify(this.state, null, 1),
			);
		}, 200);
	}
}
