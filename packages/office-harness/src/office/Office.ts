import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkDelivery, DEFAULT_LIMITS, type Limits } from "../guards/guards";
import type {
	Handoff,
	InboxItem,
	Message,
	OfficeEvent,
	OfficeState,
	Presence,
	Room,
	Teammate,
} from "./types";

const today = () => new Date().toISOString().slice(0, 10);

const shortId = () => Math.random().toString(36).slice(2, 10);

export interface OfficeOptions {
	statePath: string;
	limits?: Partial<Limits>;
}

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
		if (teammate.budget.day !== today()) {
			teammate.budget.day = today();
			teammate.budget.usedToday = 0;
		}
		if (teammate.budget.usedToday >= teammate.budget.dailyTurns) return false;
		teammate.budget.usedToday += 1;
		this.emit({ type: "teammate", teammate: structuredClone(teammate) });
		return true;
	}

	onInbox(teammateId: string, receive: (item: InboxItem) => void): void {
		this.inboxes.set(teammateId, receive);
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
		if (!room.members.includes(authorId))
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
