import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** A CLI agent running in a workspace terminal, with the names the city shows for it. */
export interface CityAgentInfo {
	terminalId: string;
	workspaceId: string;
	projectId: string;
	/** The agent kind, "claude" or "codex"; the base of its @handle. */
	agentId: string;
	label: string;
	workspaceName: string;
	projectName: string;
}

export interface CitySeat {
	terminalId: string;
	projectId: string;
	roomId: string;
	since: number;
}

export interface CityRoomMessage {
	id: string;
	/** A terminal id, or "you". */
	fromId: string;
	toIds: string[];
	text: string;
	kind: "chat" | "system";
	ts: number;
}

interface RoomState {
	relayed: number;
	paused: boolean;
	messages: CityRoomMessage[];
}

interface CityState {
	seats: CitySeat[];
	rooms: Record<string, RoomState>;
}

export interface CityRoomSnapshot {
	projectId: string;
	roomId: string;
	name: string;
	members: Array<{ terminalId: string; handle: string }>;
	relayed: number;
	paused: boolean;
	messages: CityRoomMessage[];
}

export interface CitySnapshot {
	seats: CitySeat[];
	rooms: CityRoomSnapshot[];
	maxRelays: number;
}

export interface CityRoomsDeps {
	statePath: string;
	agents: () => CityAgentInfo[];
	/** The room's name, or null when the project has no such room. */
	roomName: (projectId: string, roomId: string) => string | null;
	send: (agent: CityAgentInfo, text: string) => Promise<void>;
	/** The agent's last answer, read when its turn ends. */
	lastReply: (agent: CityAgentInfo) => Promise<string | null>;
	now?: () => number;
	/** Wait after a turn ends before reading its answer, so the agent has written it down. */
	settleMs?: number;
}

export const MEETING_ROOM = "meeting";
export const MAX_RELAYS = 8;
const KEPT_MESSAGES = 100;
const MAX_RELAY_CHARS = 4000;

/**
 * Where CLI agents sit in the city, and the talk between agents sitting in the same room: an agent
 * that starts a line with a roommate's @handle has its reply typed into that roommate's terminal.
 * Seating never changes an agent's workspace. Relays stop after MAX_RELAYS until a person speaks.
 */
export class CityRooms {
	private state: CityState;
	private readonly lastRelayed = new Map<string, string>();
	private readonly now: () => number;

	constructor(private readonly deps: CityRoomsDeps) {
		this.now = deps.now ?? Date.now;
		this.state = load(deps.statePath);
	}

	snapshot(): CitySnapshot {
		const agents = this.liveAgents();
		const keys = new Set<string>();
		for (const agent of agents) keys.add(keyOf(this.placeOf(agent)));
		for (const key of Object.keys(this.state.rooms)) keys.add(key);
		const rooms: CityRoomSnapshot[] = [];
		for (const key of keys) {
			const { projectId, roomId } = parseKey(key);
			const name = this.deps.roomName(projectId, roomId);
			if (!name) continue;
			const room = this.state.rooms[key];
			const members = this.handles(projectId, roomId, agents);
			rooms.push({
				projectId,
				roomId,
				name,
				members: [...members].map(([terminalId, handle]) => ({
					terminalId,
					handle,
				})),
				relayed: room?.relayed ?? 0,
				paused: room?.paused ?? false,
				messages: room?.messages ?? [],
			});
		}
		return { seats: this.state.seats, rooms, maxRelays: MAX_RELAYS };
	}

	/** Seats an agent in a room; its own workspace's room sends it home. Tells it who is there. */
	async seat(
		terminalId: string,
		projectId: string,
		roomId: string,
	): Promise<void> {
		const agents = this.liveAgents();
		const agent = agents.find((a) => a.terminalId === terminalId);
		if (!agent) throw new Error("That agent is no longer running");
		const name = this.deps.roomName(projectId, roomId);
		if (!name) throw new Error("That room does not exist");
		this.state.seats = this.state.seats.filter(
			(s) => s.terminalId !== terminalId,
		);
		const home = agent.projectId === projectId && agent.workspaceId === roomId;
		if (!home)
			this.state.seats.push({
				terminalId,
				projectId,
				roomId,
				since: this.now(),
			});
		const room = this.room(keyOf({ projectId, roomId }));
		this.post(room, {
			fromId: terminalId,
			toIds: [],
			text: home
				? `${agent.label} came back to its own desk`
				: `${agent.label} from ${agent.workspaceName} sat down here`,
			kind: "system",
		});
		this.save();
		const handles = this.handles(projectId, roomId, this.liveAgents());
		if (handles.size < 2) return;
		await this.deps.send(agent, this.brief(agent, name, handles));
	}

	async sendHome(terminalId: string): Promise<void> {
		const agent = this.liveAgents().find((a) => a.terminalId === terminalId);
		if (!agent) throw new Error("That agent is no longer running");
		await this.seat(terminalId, agent.projectId, agent.workspaceId);
	}

	/** A person's message to everyone in a room; it also lets paused talk go on. */
	async say(projectId: string, roomId: string, text: string): Promise<void> {
		const name = this.deps.roomName(projectId, roomId);
		if (!name) throw new Error("That room does not exist");
		const agents = this.liveAgents();
		const handles = this.handles(projectId, roomId, agents);
		const members = agents.filter((a) => handles.has(a.terminalId));
		if (members.length === 0) throw new Error("Nobody is in that room");
		const room = this.room(keyOf({ projectId, roomId }));
		room.relayed = 0;
		room.paused = false;
		this.post(room, {
			fromId: "you",
			toIds: members.map((m) => m.terminalId),
			text,
			kind: "chat",
		});
		this.save();
		const roster = this.roster(handles, agents);
		await this.deliver(
			room,
			handles,
			members,
			`[from the person running this office, to everyone in "${name}"]\n${text}${roster ? `\n\n${roster}` : ""}`,
		);
	}

	resume(projectId: string, roomId: string): void {
		const room = this.room(keyOf({ projectId, roomId }));
		room.relayed = 0;
		room.paused = false;
		this.save();
	}

	/** On a finished turn, passes the agent's answer to the roommates it @mentioned. */
	async onAgentEvent(event: {
		terminalId: string;
		eventType: string;
	}): Promise<void> {
		if (event.eventType !== "Stop") return;
		const agents = this.liveAgents();
		const agent = agents.find((a) => a.terminalId === event.terminalId);
		if (!agent) return;
		const place = this.placeOf(agent);
		const handles = this.handles(place.projectId, place.roomId, agents);
		if (handles.size < 2) return;
		const settle = this.deps.settleMs ?? 1000;
		if (settle > 0) await new Promise((r) => setTimeout(r, settle));
		const reply = (await this.deps.lastReply(agent))?.trim();
		if (!reply || this.lastRelayed.get(agent.terminalId) === reply) return;
		const targets = mentioned(reply, handles, agent.terminalId);
		if (targets.length === 0) return;
		this.lastRelayed.set(agent.terminalId, reply);

		const key = keyOf(place);
		const room = this.room(key);
		const name = this.deps.roomName(place.projectId, place.roomId) ?? "";
		this.post(room, {
			fromId: agent.terminalId,
			toIds: targets,
			text: reply,
			kind: "chat",
		});
		if (room.paused) {
			this.save();
			return;
		}
		if (room.relayed >= MAX_RELAYS) {
			room.paused = true;
			this.post(room, {
				fromId: "you",
				toIds: [],
				text: `Paused after ${MAX_RELAYS} messages between agents. Say something here, or let them continue.`,
				kind: "system",
			});
			this.save();
			return;
		}
		room.relayed += 1;
		this.save();
		const handle = handles.get(agent.terminalId) ?? agent.agentId;
		const body =
			reply.length > MAX_RELAY_CHARS
				? `${reply.slice(0, MAX_RELAY_CHARS)}…`
				: reply;
		const roster = this.roster(handles, agents);
		await this.deliver(
			room,
			handles,
			agents.filter((a) => targets.includes(a.terminalId)),
			`[from @${handle} in "${name}": ${agent.label} working in "${agent.workspaceName}", project ${agent.projectName}]\n${body}\n\n(Answer by starting a line with @${handle}. Leave them unmentioned when nothing needs saying.)${roster ? `\n${roster}` : ""}`,
		);
	}

	/** Types the text into each agent's terminal; a failed one is noted in the room. */
	private async deliver(
		room: RoomState,
		handles: Map<string, string>,
		to: CityAgentInfo[],
		text: string,
	): Promise<void> {
		const results = await Promise.allSettled(
			to.map((agent) => this.deps.send(agent, text)),
		);
		let failed = false;
		results.forEach((result, i) => {
			const agent = to[i];
			if (result.status === "fulfilled" || !agent) return;
			failed = true;
			const reason =
				result.reason instanceof Error
					? result.reason.message
					: String(result.reason);
			this.post(room, {
				fromId: "you",
				toIds: [],
				text: `Could not reach @${handles.get(agent.terminalId) ?? agent.agentId}: ${reason}`,
				kind: "system",
			});
		});
		if (failed) this.save();
	}

	private brief(
		agent: CityAgentInfo,
		roomName: string,
		handles: Map<string, string>,
	): string {
		const agents = this.liveAgents();
		const others = agents
			.filter(
				(a) => handles.has(a.terminalId) && a.terminalId !== agent.terminalId,
			)
			.map(
				(a) =>
					`@${handles.get(a.terminalId)} (${a.label}, working in "${a.workspaceName}", project ${a.projectName})`,
			);
		return [
			`[Paradev office] You now sit in "${roomName}" with ${others.join(", ")}. You are @${handles.get(agent.terminalId)} here.`,
			"Your own workspace, folder and branch have not changed; keep working there.",
			"To say something to one of them, start a line of your reply with their @handle; @all reaches everyone here. Their messages reach you starting with [from @handle].",
			"Do not mention anyone when you have nothing for them. You do not need to answer this message.",
		].join("\n");
	}

	private roster(
		handles: Map<string, string>,
		agents: CityAgentInfo[],
	): string {
		if (handles.size < 2) return "";
		const people = agents
			.filter((a) => handles.has(a.terminalId))
			.map(
				(a) => `@${handles.get(a.terminalId)} (${a.label}, ${a.workspaceName})`,
			);
		return `Here: ${people.join(", ")}.`;
	}

	private placeOf(agent: CityAgentInfo): { projectId: string; roomId: string } {
		const seat = this.state.seats.find(
			(s) => s.terminalId === agent.terminalId,
		);
		return seat
			? { projectId: seat.projectId, roomId: seat.roomId }
			: { projectId: agent.projectId, roomId: agent.workspaceId };
	}

	/** Who is in a room and their @handles: the agent kind, with the workspace added where two clash. */
	private handles(
		projectId: string,
		roomId: string,
		agents: CityAgentInfo[],
	): Map<string, string> {
		const here = agents.filter((a) => {
			const place = this.placeOf(a);
			return place.projectId === projectId && place.roomId === roomId;
		});
		return handlesFor(here);
	}

	private liveAgents(): CityAgentInfo[] {
		const agents = this.deps.agents();
		const live = new Set(agents.map((a) => a.terminalId));
		const seats = this.state.seats.filter((s) => live.has(s.terminalId));
		if (seats.length !== this.state.seats.length) {
			this.state.seats = seats;
			this.save();
		}
		return agents;
	}

	private room(key: string): RoomState {
		let room = this.state.rooms[key];
		if (!room) {
			room = { relayed: 0, paused: false, messages: [] };
			this.state.rooms[key] = room;
		}
		return room;
	}

	private post(room: RoomState, message: Omit<CityRoomMessage, "id" | "ts">) {
		room.messages.push({
			id: randomBytes(6).toString("hex"),
			ts: this.now(),
			...message,
		});
		if (room.messages.length > KEPT_MESSAGES)
			room.messages.splice(0, room.messages.length - KEPT_MESSAGES);
	}

	private save(): void {
		writeFileSync(this.deps.statePath, JSON.stringify(this.state, null, "\t"));
	}
}

export function handlesFor(agents: CityAgentInfo[]): Map<string, string> {
	const base = (a: CityAgentInfo) => slug(a.agentId) || "agent";
	const counts = new Map<string, number>();
	for (const a of agents) counts.set(base(a), (counts.get(base(a)) ?? 0) + 1);
	const handles = new Map<string, string>();
	const taken = new Set<string>();
	const ordered = [...agents].sort((a, b) =>
		a.terminalId.localeCompare(b.terminalId),
	);
	for (const a of ordered) {
		let handle =
			(counts.get(base(a)) ?? 0) > 1
				? `${base(a)}-${slug(a.workspaceName).slice(0, 16) || "x"}`
				: base(a);
		for (let n = 2; taken.has(handle); n++) handle = `${handle}-${n}`;
		taken.add(handle);
		handles.set(a.terminalId, handle);
	}
	return handles;
}

/** Roommates the reply @mentions (or all of them for @all), other than the speaker. */
export function mentioned(
	reply: string,
	handles: Map<string, string>,
	speakerId: string,
): string[] {
	const text = reply.toLowerCase();
	const says = (handle: string) =>
		new RegExp(`(^|[^a-z0-9-])@${handle}(?![a-z0-9-])`).test(text);
	const others = [...handles].filter(([id]) => id !== speakerId);
	if (says("all") || says("everyone")) return others.map(([id]) => id);
	return others.filter(([, handle]) => says(handle)).map(([id]) => id);
}

function slug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function keyOf(place: { projectId: string; roomId: string }): string {
	return `${place.projectId}/${place.roomId}`;
}

function parseKey(key: string): { projectId: string; roomId: string } {
	const [projectId = "", roomId = ""] = key.split("/");
	return { projectId, roomId };
}

function load(path: string): CityState {
	if (!existsSync(path)) return { seats: [], rooms: {} };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CityState>;
		return { seats: parsed.seats ?? [], rooms: parsed.rooms ?? {} };
	} catch {
		return { seats: [], rooms: {} };
	}
}

/** The agent's last answer: its last "Assistant:" turn in its own record, else the end of its output. */
export function lastAnswer(
	text: string,
	source: "harness" | "stream" | "screen",
): string | null {
	if (source === "harness") {
		const turns = text.split(/\n\n(?=(?:User|Assistant): )/);
		const last = [...turns].reverse().find((t) => t.startsWith("Assistant: "));
		return last ? last.slice("Assistant: ".length).trim() : null;
	}
	const tail = text.trim().split("\n").slice(-20).join("\n").trim();
	return tail || null;
}
