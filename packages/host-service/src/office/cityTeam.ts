import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	handleOf,
	type NamedAgent,
	OFFICE_CLI,
	saysNoReply,
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
	at: number;
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
	/** The item it marked as being worked on. */
	doing: string | null;
	open: number;
}

export interface CityTeamSnapshot {
	teammates: CityTeammate[];
	todos: CityTodo[];
	notes: CityNote[];
	/** When the person last read what each teammate wrote to them, by teammate id. */
	readAt: Record<string, number>;
}

export interface CityTeamDeps {
	statePath: string;
	agents: () => NamedAgent[];
	send: (agent: NamedAgent, text: string) => Promise<void>;
	lastReply: (agent: NamedAgent) => Promise<string | null>;
	successorOf?: (terminalId: string, workspaceId: string) => string | undefined;
	/** True when the room talk already passes this answer on to that teammate. */
	passedOnInRoom?: (fromId: string, toId: string, reply: string) => boolean;
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
}

const TAG = "[Paradev office]";

/**
 * The team as equals: the person and every running CLI agent. Each has its own list, anyone may
 * write to or ask anyone, and an ask comes back to the asker when the other's turn ends.
 */
export class CityTeam {
	private readonly state: TeamState;
	private readonly now: () => number;
	private readonly cli: string;

	constructor(private readonly deps: CityTeamDeps) {
		this.now = deps.now ?? Date.now;
		this.cli = deps.officeCli ?? OFFICE_CLI;
		this.state = load(deps.statePath);
	}

	snapshot(): CityTeamSnapshot {
		const agents = this.live();
		return {
			teammates: [this.person(), ...agents.map((a) => this.teammate(a))],
			todos: this.state.todos,
			notes: this.state.notes,
			readAt: this.state.readAt,
		};
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
		this.state.readAt[fromId] = this.now();
		this.save();
	}

	async say(input: {
		fromId: string;
		to: string[];
		text: string;
	}): Promise<CityNote> {
		const agents = this.live();
		const targets = this.targets(input.to, input.fromId, agents);
		const text = input.text.trim();
		if (!text) throw new Error("A message needs some text");
		const from = this.nameOf(input.fromId, agents);
		const note = this.note(input.fromId, from, targets, text, false);
		for (const ask of this.state.asks) {
			if (
				!ask.answered &&
				ask.toId === input.fromId &&
				targets.includes(ask.fromId)
			)
				ask.answered = true;
		}
		this.save();
		await this.deliver(
			agents.filter((a) => targets.includes(a.terminalId)),
			`${TAG} ${from.name} (@${from.handle}) writes:\n${text}\n\n(No answer is needed. To write back: ${this.cli} say @${from.handle} "...")`,
		);
		return note;
	}

	async ask(input: {
		fromId: string;
		to: string;
		text: string;
	}): Promise<CityTodo> {
		const agents = this.live();
		const [toId] = this.targets([input.to], input.fromId, agents);
		const text = input.text.trim();
		if (!toId) throw new Error("Nobody to ask");
		if (!text) throw new Error("An ask needs some text");
		const from = this.nameOf(input.fromId, agents);
		const to = agents.find((a) => a.terminalId === toId);
		const at = this.now();
		const todo: CityTodo = {
			id: `D-${this.state.next}`,
			ownerId: toId,
			ownerName: to?.name ?? "You",
			...(to ? { ownerWorkspaceId: to.workspaceId } : {}),
			text,
			state: "open",
			askedById: input.fromId,
			askedByName: from.name,
			askId: `A-${this.state.next}`,
			createdAt: at,
			updatedAt: at,
		};
		this.state.next += 1;
		this.state.todos.push(todo);
		this.state.asks.push({
			id: todo.askId ?? todo.id,
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
		});
		this.note(input.fromId, from, [toId], text, true);
		this.save();
		if (to)
			await this.deliver(
				[to],
				[
					`${TAG} ${from.name} (@${from.handle}) asks you:\n${text}`,
					`It is on your list as ${todo.id}. When you have the answer: ${this.cli} say @${from.handle} "..."`,
					`To keep your list: ${this.cli} todo start ${todo.id}, then ${this.cli} todo finish ${todo.id}. If it is not yours to do: ${this.cli} todo drop ${todo.id}.`,
				].join("\n\n"),
			);
		return todo;
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
		this.state.next += 1;
		this.state.todos.push(todo);
		this.save();
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
		todo.state = input.state;
		todo.updatedAt = this.now();
		const ask = this.state.asks.find((a) => a.id === todo.askId);
		const closing = input.state === "finished" || input.state === "dropped";
		const tell = ask && !ask.answered && closing ? ask : null;
		if (tell) tell.answered = true;
		this.save();
		if (tell) {
			const owner = this.nameOf(todo.ownerId, agents);
			const verb = input.state === "finished" ? "finished" : "dropped";
			const line = `${owner.name} (@${owner.handle}) ${verb} what you asked: ${todo.text}`;
			this.note(todo.ownerId, owner, [tell.fromId], line, false);
			this.save();
			await this.deliver(
				agents.filter((a) => a.terminalId === tell.fromId),
				`${TAG} ${line}\n\n(No answer is needed.)`,
			);
		}
		return todo;
	}

	/** When an asked agent's turn ends without it writing back, its last words go to the asker. */
	async onAgentEvent(event: {
		terminalId: string;
		eventType: string;
	}): Promise<void> {
		const waiting = this.state.asks.filter(
			(a) => !a.answered && a.toId === event.terminalId,
		);
		if (waiting.length === 0) return;
		if (event.eventType === "Start") {
			for (const ask of waiting) ask.started = true;
			this.save();
			return;
		}
		if (event.eventType !== "Stop") return;
		const due = waiting.filter((a) => a.started);
		if (due.length === 0) return;
		const settle = this.deps.settleMs ?? 1000;
		if (settle > 0) await new Promise((r) => setTimeout(r, settle));
		const agents = this.live();
		const agent = agents.find((a) => a.terminalId === event.terminalId);
		if (!agent) return;
		const reply = (await this.deps.lastReply(agent))?.trim();
		for (const ask of due) {
			if (ask.answered) continue;
			ask.answered = true;
			if (!reply || saysNoReply(reply)) continue;
			if (this.deps.passedOnInRoom?.(agent.terminalId, ask.fromId, reply))
				continue;
			const who = this.nameOf(agent.terminalId, agents);
			this.note(agent.terminalId, who, [ask.fromId], reply, false);
			await this.deliver(
				agents.filter((a) => a.terminalId === ask.fromId),
				`${TAG} ${who.name} (@${who.handle}) ended its turn on what you asked (${ask.todoId}: ${ask.text}). Its last words:\n${reply}\n\n(No answer is needed.)`,
			);
		}
		this.save();
	}

	private async deliver(to: NamedAgent[], text: string): Promise<void> {
		const results = await Promise.allSettled(
			to.map((agent) => this.deps.send(agent, text)),
		);
		const failed = results.flatMap((result, i) => {
			const agent = to[i];
			return result.status === "rejected" && agent
				? [`${agent.name}: ${reason(result.reason)}`]
				: [];
		});
		if (failed.length > 0)
			throw new Error(`Could not reach ${failed.join("; ")}`);
	}

	private note(
		fromId: string,
		from: { name: string },
		toIds: string[],
		text: string,
		expectsReply: boolean,
	): CityNote {
		const note: CityNote = {
			id: `N-${this.state.notes.length + 1}`,
			fromId,
			fromName: from.name,
			toIds,
			text,
			expectsReply,
			at: this.now(),
		};
		this.state.notes.push(note);
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
			const agent = agents.find((a) => handleOf(a) === handle);
			if (!agent) throw new Error(`Nobody here is @${handle}`);
			ids.add(agent.terminalId);
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
		return agent
			? { name: agent.name, handle: handleOf(agent) }
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
			...this.carrying(agent.terminalId),
		};
	}

	private carrying(ownerId: string): { doing: string | null; open: number } {
		const mine = this.state.todos.filter((t) => t.ownerId === ownerId);
		return {
			doing: mine.find((t) => t.state === "doing")?.text ?? null,
			open: mine.filter((t) => t.state === "open" || t.state === "doing")
				.length,
		};
	}

	/** The running agents; lists and asks follow an agent into the terminal it continued in. */
	private live(): NamedAgent[] {
		const agents = this.deps.agents();
		const alive = new Set(agents.map((a) => a.terminalId));
		const next = (id: string, workspaceId: string | undefined) => {
			if (id === YOU || alive.has(id) || !workspaceId) return id;
			const successor = this.deps.successorOf?.(id, workspaceId);
			return successor && alive.has(successor) ? successor : id;
		};
		let moved = false;
		const move = (from: string, to: string) => {
			if (from !== to) moved = true;
			return to;
		};
		for (const todo of this.state.todos) {
			todo.ownerId = move(
				todo.ownerId,
				next(todo.ownerId, todo.ownerWorkspaceId),
			);
		}
		for (const ask of this.state.asks) {
			ask.toId = move(ask.toId, next(ask.toId, ask.toWorkspaceId));
			ask.fromId = move(ask.fromId, next(ask.fromId, ask.fromWorkspaceId));
		}
		if (moved) this.save();
		return agents;
	}

	private save(): void {
		writeFileSync(this.deps.statePath, JSON.stringify(this.state, null, 1));
	}
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

function load(path: string): TeamState {
	const empty: TeamState = {
		next: 1,
		todos: [],
		asks: [],
		notes: [],
		readAt: {},
	};
	if (!existsSync(path)) return empty;
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<TeamState>;
		return {
			next: raw.next ?? 1,
			todos: raw.todos ?? [],
			asks: raw.asks ?? [],
			notes: raw.notes ?? [],
			readAt: raw.readAt ?? {},
		};
	} catch {
		return empty;
	}
}
