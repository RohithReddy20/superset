import {
	type CityRoomRef,
	handleOf,
	type NamedAgent,
	OFFICE_CLI,
} from "./cityRooms";

/** The person's id on lists and messages; their handle is the same word. */
export const YOU = "you";

export type CityTodoState = "open" | "doing" | "finished" | "dropped";

/** One item on a teammate's own list. Only its owner moves it. */
export interface CityTodo {
	id: string;
	/** A terminal id, or {@link YOU}. */
	ownerId: string;
	ownerName: string;
	/** The owner's workspace, to find the terminal it continues in after a restart. */
	ownerWorkspaceId?: string;
	text: string;
	state: CityTodoState;
	askedById?: string;
	askedByName?: string;
	askId?: string;
	createdAt: number;
	updatedAt: number;
}

/** Something one teammate asked of another; open until the other writes back or its turn ends. */
export interface CityAsk {
	id: string;
	fromId: string;
	fromName: string;
	fromWorkspaceId?: string;
	toId: string;
	toWorkspaceId?: string;
	text: string;
	todoId: string;
	/** Set when the asked agent began a turn after the ask reached it. */
	started: boolean;
	answered: boolean;
	createdAt: number;
}

export interface CityNote {
	id: string;
	fromId: string;
	fromName: string;
	toIds: string[];
	text: string;
	expectsReply: boolean;
	/** Set when it was written to everyone sitting in a room. */
	room?: { projectId: string; roomId: string; name: string };
	/** Set when it records what the team decided; the items are who took what. */
	decision?: { todoIds: string[] };
	at: number;
}

/** A message on its way into an agent's terminal; it waits while the agent cannot be reached. */
export interface CityDelivery {
	id: string;
	toId: string;
	toName: string;
	toWorkspaceId?: string;
	text: string;
	status: "queued" | "delivered";
	error?: string;
	createdAt: number;
}

export interface CityTeammate {
	id: string;
	name: string;
	handle: string;
	kind: "person" | "agent";
	/** The agent kind, such as "Claude"; unset for the person. */
	label?: string;
	workspaceName?: string;
	projectName?: string;
	/** The room it sits in. */
	room?: string;
	/** The item it marked as being worked on. */
	doing: string | null;
	open: number;
	/** Messages waiting to reach its terminal. */
	waiting: number;
}

export interface CityTeamSnapshot {
	teammates: CityTeammate[];
	todos: CityTodo[];
	notes: CityNote[];
	/** When the person last read what each teammate wrote to them, by teammate id. */
	readAt: Record<string, number>;
	/** Messages that have not reached their agent yet. */
	waiting: CityDelivery[];
}

/** Everything that happens in the team, in order. The team's state is these, replayed. */
export type CityTeamEvent =
	| { kind: "note"; note: CityNote }
	| { kind: "todo.added"; todo: CityTodo }
	| { kind: "todo.moved"; id: string; state: CityTodoState; at: number }
	| { kind: "ask.added"; ask: CityAsk }
	| { kind: "ask.started"; id: string }
	| { kind: "ask.answered"; id: string }
	| { kind: "read"; fromId: string; at: number }
	| { kind: "delivery.queued"; delivery: CityDelivery }
	| { kind: "delivery.done"; id: string; at: number }
	| { kind: "delivery.failed"; id: string; error: string; at: number }
	/** An agent continued in a new terminal; what was its, is now the new terminal's. */
	| { kind: "moved"; fromId: string; toId: string; at: number };

export interface CityTeamLog {
	append: (event: CityTeamEvent) => void;
	all: () => CityTeamEvent[];
}

export interface CityTimelineEntry {
	at: number;
	text: string;
}

/** A named agent whose terminal is gone. */
export interface CityAwayAgent {
	terminalId: string;
	workspaceId: string;
	name: string;
	handle: string;
}

type Reach = Pick<NamedAgent, "terminalId" | "name" | "workspaceId">;

export interface CityTeamDeps {
	log: CityTeamLog;
	agents: () => NamedAgent[];
	send: (agent: NamedAgent, text: string) => Promise<void>;
	lastReply: (agent: NamedAgent) => Promise<string | null>;
	successorOf?: (terminalId: string, workspaceId: string) => string | undefined;
	/** The room an agent sits in, with everyone sitting there. */
	roomOf?: (terminalId: string) => CityRoomRef | null;
	roomAt?: (place: { projectId: string; roomId: string }) => CityRoomRef | null;
	/** Named agents that are not running now but can continue in a new terminal. */
	away?: () => CityAwayAgent[];
	/** Continues an agent that cannot be reached in a new terminal. */
	wake?: (terminalId: string) => Promise<void>;
	/** Called after anything in the team changed. */
	onChange?: () => void;
	/** Defaults to {@link OFFICE_CLI}. */
	officeCli?: string;
	now?: () => number;
	settleMs?: number;
}

interface TeamState {
	next: number;
	todos: CityTodo[];
	asks: CityAsk[];
	notes: CityNote[];
	readAt: Record<string, number>;
	deliveries: CityDelivery[];
}

const TAG = "[Paradev office]";
const TIMELINE_ENTRIES = 200;
/** An agent is not woken again while its last wake may still be starting it. */
const WAKE_AGAIN_MS = 60_000;

/**
 * The team as equals: the person and every running CLI agent. Each has its own list, anyone may
 * write to or ask anyone, and an ask comes back to the asker when the other's turn ends. A message
 * for an agent that cannot be reached waits and is typed in when the agent is back.
 */
export class CityTeam {
	private readonly state: TeamState = {
		next: 1,
		todos: [],
		asks: [],
		notes: [],
		readAt: {},
		deliveries: [],
	};
	private readonly now: () => number;
	private readonly cli: string;
	private readonly flushing = new Set<string>();
	private readonly woken = new Map<string, number>();

	constructor(private readonly deps: CityTeamDeps) {
		this.now = deps.now ?? Date.now;
		this.cli = deps.officeCli ?? OFFICE_CLI;
		for (const event of deps.log.all()) this.apply(event);
	}

	snapshot(): CityTeamSnapshot {
		const agents = this.live();
		return {
			teammates: [this.person(), ...agents.map((a) => this.teammate(a))],
			todos: this.state.todos,
			notes: this.state.notes,
			readAt: this.state.readAt,
			waiting: this.state.deliveries.filter((d) => d.status === "queued"),
		};
	}

	/** What happened with one teammate, oldest first. */
	timeline(id: string): CityTimelineEntry[] {
		this.live();
		const events = this.deps.log.all();
		const involved = new Set([id]);
		for (const event of [...events].reverse()) {
			if (event.kind === "moved" && involved.has(event.toId))
				involved.add(event.fromId);
		}
		const names = new Map<string, string>();
		const todos = new Map<string, CityTodo>();
		const deliveries = new Map<string, CityDelivery>();
		const name = (who: string) =>
			who === YOU ? "the person" : (names.get(who) ?? "a teammate");
		const entries: CityTimelineEntry[] = [];
		for (const event of events) {
			if (event.kind === "note") {
				const { note } = event;
				names.set(note.fromId, note.fromName);
				if (
					!involved.has(note.fromId) &&
					!note.toIds.some((t) => involved.has(t))
				)
					continue;
				entries.push({
					at: note.at,
					text: `${note.fromName} ${note.decision ? "wrote down a decision for" : note.expectsReply ? "asked" : "wrote to"} ${note.room ? `everyone in ${note.room.name}` : note.toIds.map(name).join(", ")}: ${note.text}`,
				});
			} else if (event.kind === "todo.added") {
				todos.set(event.todo.id, event.todo);
				names.set(event.todo.ownerId, event.todo.ownerName);
				if (!involved.has(event.todo.ownerId) || event.todo.askedById) continue;
				entries.push({
					at: event.todo.createdAt,
					text: `${event.todo.ownerName} put ${event.todo.id} on its own list: ${event.todo.text}`,
				});
			} else if (event.kind === "todo.moved") {
				const todo = todos.get(event.id);
				if (!todo || !involved.has(todo.ownerId)) continue;
				const verb =
					event.state === "doing"
						? "started"
						: event.state === "open"
							? "reopened"
							: event.state;
				entries.push({
					at: event.at,
					text: `${todo.ownerName} ${verb} ${todo.id}: ${todo.text}`,
				});
			} else if (event.kind === "delivery.queued") {
				deliveries.set(event.delivery.id, event.delivery);
				names.set(event.delivery.toId, event.delivery.toName);
			} else if (event.kind === "delivery.failed") {
				const delivery = deliveries.get(event.id);
				if (!delivery || !involved.has(delivery.toId)) continue;
				entries.push({
					at: event.at,
					text: `A message could not reach ${delivery.toName} (${event.error}); it waits`,
				});
			} else if (event.kind === "moved" && involved.has(event.toId)) {
				entries.push({ at: event.at, text: "Continued in a new terminal" });
			}
		}
		return entries.slice(-TIMELINE_ENTRIES);
	}

	/** The caller of a command: the agent in that terminal, else the person. */
	callerOf(terminalId: string | undefined): string {
		if (!terminalId) return YOU;
		return this.live().some((a) => a.terminalId === terminalId)
			? terminalId
			: YOU;
	}

	/** The person has read what this teammate wrote to them. */
	markRead(fromId: string): void {
		this.record({ kind: "read", fromId, at: this.now() });
	}

	/** Writes to teammates by @handle, to a room, or to `@room`: everyone sitting where the sender sits. */
	async say(input: {
		fromId: string;
		to: string[];
		room?: { projectId: string; roomId: string };
		text: string;
	}): Promise<{ note: CityNote; waiting: string[] }> {
		const agents = this.live();
		const text = input.text.trim();
		if (!text) throw new Error("A message needs some text");
		const named = input.to.filter((h) => !isRoomHandle(h));
		const wantsRoom = !!input.room || named.length < input.to.length;
		const room = input.room
			? (this.deps.roomAt?.(input.room) ?? null)
			: wantsRoom
				? (this.deps.roomOf?.(input.fromId) ?? null)
				: null;
		if (wantsRoom && !room)
			throw new Error(
				input.room ? "That room does not exist" : "You do not sit in a room",
			);
		const ids = new Set([
			...(room?.memberIds ?? []),
			...(named.length > 0 ? this.targets(named, input.fromId, agents) : []),
		]);
		ids.delete(input.fromId);
		if (ids.size === 0)
			throw new Error(
				room ? `Nobody else sits in ${room.name}` : "Nobody to write to",
			);
		const targets = [...ids];
		const from = this.nameOf(input.fromId, agents);
		const note = this.note(
			input.fromId,
			from,
			targets,
			text,
			false,
			room
				? { projectId: room.projectId, roomId: room.roomId, name: room.name }
				: undefined,
		);
		for (const ask of this.state.asks) {
			if (
				!ask.answered &&
				ask.toId === input.fromId &&
				targets.includes(ask.fromId)
			)
				this.record({ kind: "ask.answered", id: ask.id });
		}
		const waiting = await this.deliver(
			this.reach(targets, agents),
			room
				? `${TAG} ${from.name} (@${from.handle}) writes to everyone in "${room.name}":\n${text}\n\n(No answer is needed. To write back to the room: ${this.cli} say @room "..."; to ${from.name} only: ${this.cli} say @${from.handle} "...")`
				: `${TAG} ${from.name} (@${from.handle}) writes:\n${text}\n\n(No answer is needed. To write back: ${this.cli} say @${from.handle} "...")`,
		);
		return { note, waiting };
	}

	async ask(input: {
		fromId: string;
		to: string;
		text: string;
	}): Promise<{ todo: CityTodo; waiting: string[] }> {
		const agents = this.live();
		const [toId] = this.targets([input.to], input.fromId, agents);
		const text = input.text.trim();
		if (!toId) throw new Error("Nobody to ask");
		if (!text) throw new Error("An ask needs some text");
		const from = this.nameOf(input.fromId, agents);
		const [to] = this.reach([toId], agents);
		const at = this.now();
		const n = this.state.next;
		const todo: CityTodo = {
			id: `D-${n}`,
			ownerId: toId,
			ownerName: to?.name ?? "You",
			...(to ? { ownerWorkspaceId: to.workspaceId } : {}),
			text,
			state: "open",
			askedById: input.fromId,
			askedByName: from.name,
			askId: `A-${n}`,
			createdAt: at,
			updatedAt: at,
		};
		this.record({ kind: "todo.added", todo });
		this.record({
			kind: "ask.added",
			ask: {
				id: `A-${n}`,
				fromId: input.fromId,
				fromName: from.name,
				...workspaceOf(agents, input.fromId, "fromWorkspaceId"),
				toId,
				...(to ? { toWorkspaceId: to.workspaceId } : {}),
				text,
				todoId: todo.id,
				started: false,
				answered: false,
				createdAt: at,
			},
		});
		this.note(input.fromId, from, [toId], text, true);
		const waiting = to
			? await this.deliver(
					[to],
					[
						`${TAG} ${from.name} (@${from.handle}) asks you:\n${text}`,
						`It is on your list as ${todo.id}. When you have the answer: ${this.cli} say @${from.handle} "..."`,
						`To keep your list: ${this.cli} todo start ${todo.id}, then ${this.cli} todo finish ${todo.id}. If it is not yours to do: ${this.cli} todo drop ${todo.id}.`,
					].join("\n\n"),
				)
			: [];
		return { todo, waiting };
	}

	/**
	 * Writes down what was agreed and puts on each teammate's list what they took. It goes to the
	 * sender's room, or the given one, and to everyone who took something.
	 */
	async decide(input: {
		fromId: string;
		room?: { projectId: string; roomId: string };
		text: string;
		gives: Array<{ to: string; text: string }>;
	}): Promise<{ note: CityNote; todos: CityTodo[]; waiting: string[] }> {
		const agents = this.live();
		const text = input.text.trim();
		if (!text) throw new Error("A decision needs some text");
		const room = input.room
			? (this.deps.roomAt?.(input.room) ?? null)
			: (this.deps.roomOf?.(input.fromId) ?? null);
		if (input.room && !room) throw new Error("That room does not exist");
		const from = this.nameOf(input.fromId, agents);
		const gives = input.gives.map((give) => {
			const what = give.text.trim();
			if (!what) throw new Error("What someone took needs some text");
			const handle = give.to.trim().replace(/^@/, "").toLowerCase();
			const own = handle === "me" || handle === from.handle.toLowerCase();
			const [toId] = own
				? [input.fromId]
				: this.targets([give.to], input.fromId, agents);
			if (!toId) throw new Error(`Nobody here is @${handle}`);
			return { toId, text: what };
		});
		const ids = new Set([
			...(room?.memberIds ?? []),
			...gives.map((g) => g.toId),
		]);
		ids.delete(input.fromId);
		if (ids.size === 0 && gives.length === 0)
			throw new Error(
				"Nobody to tell: sit in a room with others, or give someone an item",
			);
		const at = this.now();
		const todos = gives.map((give) => {
			const [to] = this.reach([give.toId], agents);
			const own = give.toId === input.fromId;
			const todo: CityTodo = {
				id: `D-${this.state.next}`,
				ownerId: give.toId,
				ownerName: to?.name ?? "You",
				...(to ? { ownerWorkspaceId: to.workspaceId } : {}),
				text: give.text,
				state: "open",
				...(own ? {} : { askedById: input.fromId, askedByName: from.name }),
				createdAt: at,
				updatedAt: at,
			};
			this.record({ kind: "todo.added", todo });
			return todo;
		});
		const targets = [...ids];
		const note = this.note(
			input.fromId,
			from,
			targets,
			text,
			false,
			room
				? { projectId: room.projectId, roomId: room.roomId, name: room.name }
				: undefined,
			{ todoIds: todos.map((t) => t.id) },
		);
		const took = todos.map(
			(t) =>
				`- ${t.ownerId === YOU ? "The person" : t.ownerName} took ${t.id}: ${t.text}`,
		);
		const waiting = await this.deliver(
			this.reach(targets, agents),
			[
				`${TAG} ${from.name} (@${from.handle}) wrote down what ${room ? `"${room.name}"` : "the team"} decided:\n${text}`,
				took.length > 0 ? `Who took what:\n${took.join("\n")}` : "",
				`(What you took is on your own list: ${this.cli} todo start <id>, then ${this.cli} todo finish <id>. If this is not what was agreed, say so: ${this.cli} say @${from.handle} "...")`,
			]
				.filter(Boolean)
				.join("\n\n"),
		);
		return { note, todos, waiting };
	}

	addTodo(input: { callerId: string; text: string }): CityTodo {
		const agents = this.live();
		const text = input.text.trim();
		if (!text) throw new Error("An item needs some text");
		const owner = agents.find((a) => a.terminalId === input.callerId);
		const at = this.now();
		const todo: CityTodo = {
			id: `D-${this.state.next}`,
			ownerId: input.callerId,
			ownerName: owner?.name ?? "You",
			...(owner ? { ownerWorkspaceId: owner.workspaceId } : {}),
			text,
			state: "open",
			createdAt: at,
			updatedAt: at,
		};
		this.record({ kind: "todo.added", todo });
		return todo;
	}

	async setTodo(input: {
		callerId: string;
		id: string;
		state: CityTodoState;
	}): Promise<CityTodo> {
		const agents = this.live();
		const todo = this.state.todos.find(
			(t) => t.id.toLowerCase() === input.id.trim().toLowerCase(),
		);
		if (!todo) throw new Error(`No item ${input.id}`);
		if (todo.ownerId !== input.callerId)
			throw new Error(
				`${todo.id} is on ${todo.ownerName}'s list; only its owner moves it`,
			);
		this.record({
			kind: "todo.moved",
			id: todo.id,
			state: input.state,
			at: this.now(),
		});
		const ask = this.state.asks.find((a) => a.id === todo.askId);
		const closing = input.state === "finished" || input.state === "dropped";
		if (ask && !ask.answered && closing) {
			this.record({ kind: "ask.answered", id: ask.id });
			const owner = this.nameOf(todo.ownerId, agents);
			const verb = input.state === "finished" ? "finished" : "dropped";
			const line = `${owner.name} (@${owner.handle}) ${verb} what you asked: ${todo.text}`;
			this.note(todo.ownerId, owner, [ask.fromId], line, false);
			await this.deliver(
				this.reach([ask.fromId], agents),
				`${TAG} ${line}\n\n(No answer is needed.)`,
			);
		}
		return todo;
	}

	/**
	 * Any sign of life from an agent sends it what waited for it. When an asked agent's turn ends
	 * without it writing back, its last words go to the asker.
	 */
	async onAgentEvent(event: {
		terminalId: string;
		eventType: string;
	}): Promise<void> {
		const agents = this.live();
		const agent = agents.find((a) => a.terminalId === event.terminalId);
		if (agent) await this.flush(agent.terminalId);
		const waiting = this.state.asks.filter(
			(a) => !a.answered && a.toId === event.terminalId,
		);
		if (waiting.length === 0) return;
		if (event.eventType === "Start") {
			for (const ask of waiting)
				if (!ask.started) this.record({ kind: "ask.started", id: ask.id });
			return;
		}
		if (event.eventType !== "Stop" || !agent) return;
		const due = waiting.filter((a) => a.started);
		if (due.length === 0) return;
		const settle = this.deps.settleMs ?? 1000;
		if (settle > 0) await new Promise((r) => setTimeout(r, settle));
		const reply = (await this.deps.lastReply(agent))?.trim();
		for (const ask of due) {
			if (ask.answered) continue;
			this.record({ kind: "ask.answered", id: ask.id });
			if (!reply) continue;
			const who = this.nameOf(agent.terminalId, agents);
			this.note(agent.terminalId, who, [ask.fromId], reply, false);
			await this.deliver(
				this.reach([ask.fromId], this.live()),
				`${TAG} ${who.name} (@${who.handle}) ended its turn on what you asked (${ask.todoId}: ${ask.text}). Its last words:\n${reply}\n\n(No answer is needed.)`,
			);
		}
	}

	/** The teammates behind these ids that a message can be queued for: running agents and those away. */
	private reach(ids: string[], agents: NamedAgent[]): Reach[] {
		const away = this.deps.away?.() ?? [];
		return ids.flatMap((id) => {
			const found =
				agents.find((a) => a.terminalId === id) ??
				away.find((a) => a.terminalId === id);
			return found ? [found] : [];
		});
	}

	/** Queues the text for each agent and tries to type it in; resolves to who it still waits for. */
	private async deliver(to: Reach[], text: string): Promise<string[]> {
		for (const agent of to) {
			this.record({
				kind: "delivery.queued",
				delivery: {
					id: `M-${this.state.deliveries.length + 1}`,
					toId: agent.terminalId,
					toName: agent.name,
					toWorkspaceId: agent.workspaceId,
					text,
					status: "queued",
					createdAt: this.now(),
				},
			});
		}
		await Promise.all(to.map((agent) => this.flush(agent.terminalId)));
		return to
			.filter((agent) =>
				this.state.deliveries.some(
					(d) => d.toId === agent.terminalId && d.status === "queued",
				),
			)
			.map((agent) => agent.name);
	}

	/**
	 * Types in, oldest first, what waits for this agent; stops at the first that fails. An agent
	 * that cannot be reached is started again, and gets what waits when it is back.
	 */
	private async flush(terminalId: string): Promise<void> {
		if (this.flushing.has(terminalId)) return;
		const agent = this.deps.agents().find((a) => a.terminalId === terminalId);
		if (!agent) {
			this.wake(terminalId);
			return;
		}
		this.flushing.add(terminalId);
		try {
			for (;;) {
				const next = this.state.deliveries.find(
					(d) => d.toId === terminalId && d.status === "queued",
				);
				if (!next) return;
				try {
					await this.deps.send(agent, next.text);
				} catch (error) {
					const message = reason(error);
					if (next.error !== message)
						this.record({
							kind: "delivery.failed",
							id: next.id,
							error: message,
							at: this.now(),
						});
					this.wake(terminalId);
					return;
				}
				this.record({ kind: "delivery.done", id: next.id, at: this.now() });
			}
		} finally {
			this.flushing.delete(terminalId);
		}
	}

	private wake(terminalId: string): void {
		const last = this.woken.get(terminalId);
		if (last !== undefined && this.now() - last < WAKE_AGAIN_MS) return;
		this.woken.set(terminalId, this.now());
		void this.deps.wake?.(terminalId).catch(() => {});
	}

	private note(
		fromId: string,
		from: { name: string },
		toIds: string[],
		text: string,
		expectsReply: boolean,
		room?: CityNote["room"],
		decision?: CityNote["decision"],
	): CityNote {
		const note: CityNote = {
			id: `N-${this.state.notes.length + 1}`,
			fromId,
			fromName: from.name,
			toIds,
			text,
			expectsReply,
			...(room ? { room } : {}),
			...(decision ? { decision } : {}),
			at: this.now(),
		};
		this.record({ kind: "note", note });
		return note;
	}

	/** The ids behind @handles; "all" is everyone but the sender. */
	private targets(
		to: string[],
		fromId: string,
		agents: NamedAgent[],
	): string[] {
		const ids = new Set<string>();
		for (const raw of to) {
			const handle = raw.trim().replace(/^@/, "").toLowerCase();
			if (!handle) continue;
			if (handle === "all" || handle === "everyone") {
				ids.add(YOU);
				for (const a of agents) ids.add(a.terminalId);
				continue;
			}
			if (handle === YOU) {
				ids.add(YOU);
				continue;
			}
			const id =
				agents.find((a) => handleOf(a) === handle)?.terminalId ??
				this.deps.away?.().find((a) => a.handle === handle)?.terminalId;
			if (!id) throw new Error(`Nobody here is @${handle}`);
			ids.add(id);
		}
		ids.delete(fromId);
		if (ids.size === 0) throw new Error("Nobody to write to");
		return [...ids];
	}

	private nameOf(
		id: string,
		agents: NamedAgent[],
	): { name: string; handle: string } {
		const agent = agents.find((a) => a.terminalId === id);
		if (agent) return { name: agent.name, handle: handleOf(agent) };
		const away = this.deps.away?.().find((a) => a.terminalId === id);
		return away
			? { name: away.name, handle: away.handle }
			: { name: "The person", handle: YOU };
	}

	private person(): CityTeammate {
		return {
			id: YOU,
			name: "You",
			handle: YOU,
			kind: "person",
			...this.carrying(YOU),
		};
	}

	private teammate(agent: NamedAgent): CityTeammate {
		return {
			id: agent.terminalId,
			name: agent.name,
			handle: handleOf(agent),
			kind: "agent",
			label: agent.label,
			workspaceName: agent.workspaceName,
			projectName: agent.projectName,
			...roomName(this.deps.roomOf?.(agent.terminalId)),
			...this.carrying(agent.terminalId),
		};
	}

	private carrying(ownerId: string): {
		doing: string | null;
		open: number;
		waiting: number;
	} {
		const mine = this.state.todos.filter((t) => t.ownerId === ownerId);
		return {
			doing: mine.find((t) => t.state === "doing")?.text ?? null,
			open: mine.filter((t) => t.state === "open" || t.state === "doing")
				.length,
			waiting: this.state.deliveries.filter(
				(d) => d.toId === ownerId && d.status === "queued",
			).length,
		};
	}

	/** The running agents; what belongs to an agent follows it into the terminal it continued in. */
	private live(): NamedAgent[] {
		const agents = this.deps.agents();
		const alive = new Set(agents.map((a) => a.terminalId));
		const owners = new Map<string, string | undefined>();
		for (const todo of this.state.todos)
			owners.set(todo.ownerId, todo.ownerWorkspaceId);
		for (const ask of this.state.asks) {
			owners.set(ask.toId, ask.toWorkspaceId);
			owners.set(ask.fromId, ask.fromWorkspaceId);
		}
		for (const delivery of this.state.deliveries)
			if (delivery.status === "queued")
				owners.set(delivery.toId, delivery.toWorkspaceId);
		for (const [id, workspaceId] of owners) {
			if (id === YOU || alive.has(id) || !workspaceId) continue;
			const successor = this.deps.successorOf?.(id, workspaceId);
			if (successor && alive.has(successor))
				this.record({
					kind: "moved",
					fromId: id,
					toId: successor,
					at: this.now(),
				});
		}
		return agents;
	}

	private record(event: CityTeamEvent): void {
		this.deps.log.append(event);
		this.apply(event);
		this.deps.onChange?.();
	}

	private apply(event: CityTeamEvent): void {
		const { state } = this;
		switch (event.kind) {
			case "note":
				state.notes.push({ ...event.note });
				return;
			case "todo.added":
				state.todos.push({ ...event.todo });
				state.next += 1;
				return;
			case "todo.moved": {
				const todo = state.todos.find((t) => t.id === event.id);
				if (!todo) return;
				todo.state = event.state;
				todo.updatedAt = event.at;
				return;
			}
			case "ask.added":
				state.asks.push({ ...event.ask });
				return;
			case "ask.started": {
				const ask = state.asks.find((a) => a.id === event.id);
				if (ask) ask.started = true;
				return;
			}
			case "ask.answered": {
				const ask = state.asks.find((a) => a.id === event.id);
				if (ask) ask.answered = true;
				return;
			}
			case "read":
				state.readAt[event.fromId] = event.at;
				return;
			case "delivery.queued":
				state.deliveries.push({ ...event.delivery });
				return;
			case "delivery.done": {
				const delivery = state.deliveries.find((d) => d.id === event.id);
				if (delivery) delivery.status = "delivered";
				return;
			}
			case "delivery.failed": {
				const delivery = state.deliveries.find((d) => d.id === event.id);
				if (delivery) delivery.error = event.error;
				return;
			}
			case "moved": {
				const { fromId, toId } = event;
				for (const todo of state.todos)
					if (todo.ownerId === fromId) todo.ownerId = toId;
				for (const ask of state.asks) {
					if (ask.toId === fromId) ask.toId = toId;
					if (ask.fromId === fromId) ask.fromId = toId;
				}
				for (const delivery of state.deliveries)
					if (delivery.toId === fromId) delivery.toId = toId;
				if (state.readAt[fromId] !== undefined) {
					state.readAt[toId] = state.readAt[fromId];
					delete state.readAt[fromId];
				}
				for (const note of state.notes) {
					if (note.fromId === fromId) note.fromId = toId;
					note.toIds = note.toIds.map((id) => (id === fromId ? toId : id));
				}
				return;
			}
		}
	}
}

/** A log kept in memory, for tests and hosts with nowhere to save one. */
export function memoryTeamLog(events: CityTeamEvent[] = []): CityTeamLog {
	return {
		append: (event) => {
			events.push(structuredClone(event));
		},
		all: () => events,
	};
}

function isRoomHandle(handle: string): boolean {
	return handle.trim().replace(/^@/, "").toLowerCase() === "room";
}

function roomName(room: CityRoomRef | null | undefined): { room?: string } {
	return room ? { room: room.name } : {};
}

function workspaceOf<K extends string>(
	agents: NamedAgent[],
	id: string,
	key: K,
): Partial<Record<K, string>> {
	const agent = agents.find((a) => a.terminalId === id);
	return agent
		? ({ [key]: agent.workspaceId } as Record<K, string>)
		: ({} as Partial<Record<K, string>>);
}

function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
