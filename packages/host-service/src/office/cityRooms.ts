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
	/** The agent's own workspace, to find the terminal it continues in after a restart. */
	workspaceId?: string;
	projectId: string;
	roomId: string;
	since: number;
	/** When its agent was first seen not running; cleared when it runs again. */
	missingSince?: number;
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

/**
 * Work moving to another workspace: the agent writes a brief, a new agent starts in the target
 * workspace with it and sits where the first one sits. An agent's own request waits for a person.
 */
export interface CityHandover {
	id: string;
	fromTerminalId: string;
	fromLabel: string;
	fromWorkspaceName: string;
	requestedBy: "you" | "agent";
	/** What the agent asked for, in its words; set for an agent's request. */
	request?: string;
	toWorkspaceId?: string;
	toWorkspaceName?: string;
	/** The agent kind to start there, "claude" or "codex". */
	agent?: string;
	note?: string;
	status: "asked" | "briefing" | "starting" | "done" | "failed" | "declined";
	brief?: string;
	newTerminalId?: string;
	error?: string;
	createdAt: number;
}

interface CityState {
	seats: CitySeat[];
	rooms: Record<string, RoomState>;
	handovers: CityHandover[];
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
	handovers: CityHandover[];
}

export interface CityRoomsDeps {
	statePath: string;
	agents: () => CityAgentInfo[];
	/** The room's name, or null when the project has no such room. */
	roomName: (projectId: string, roomId: string) => string | null;
	send: (agent: CityAgentInfo, text: string) => Promise<void>;
	/** The agent's last answer, read when its turn ends. */
	lastReply: (agent: CityAgentInfo) => Promise<string | null>;
	/** A workspace on this host, or null when there is none with that id. */
	workspace?: (workspaceId: string) => {
		projectId: string;
		name: string;
		projectName: string;
		path: string;
	} | null;
	/** Starts an agent in a workspace with a first prompt; resolves to its terminal. */
	startAgent?: (
		workspaceId: string,
		agent: string,
		prompt: string,
	) => Promise<{ terminalId: string }>;
	/** The terminal an agent continued in after its terminal was restarted, if any. */
	successorOf?: (terminalId: string, workspaceId: string) => string | undefined;
	now?: () => number;
	/** Wait after a turn ends before reading its answer, so the agent has written it down. */
	settleMs?: number;
}

export const MEETING_ROOM = "meeting";
export const MAX_RELAYS = 8;
/** A seat whose agent stopped running is kept this long, in case it comes back in a new terminal. */
export const SEAT_KEPT_MS = 24 * 60 * 60 * 1000;
/** What an agent writes to end its part in a room's talk; such an answer is never passed on. */
export const NO_REPLY = "no reply";
export const HANDOVER_REQUEST = "HANDOVER REQUEST:";
const HANDOVER_BRIEF = "HANDOVER BRIEF";
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
	/** What each agent was last told about its room: the room and who was in it. */
	private readonly told = new Map<string, { key: string; people: string }>();
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
		const live = new Set(agents.map((a) => a.terminalId));
		return {
			seats: this.state.seats.filter((s) => live.has(s.terminalId)),
			rooms,
			maxRelays: MAX_RELAYS,
			handovers: this.state.handovers,
		};
	}

	/** Seats an agent in a room; its own workspace's room sends it home. Nothing is typed into any terminal. */
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
				workspaceId: agent.workspaceId,
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
		await this.deliver(
			{ projectId, roomId },
			name,
			handles,
			members,
			`[from the person running this office, to everyone in "${name}"]\n${text}`,
		);
	}

	/** You hand an agent's work to another workspace: it is asked for a brief first. */
	async handOver(input: {
		terminalId: string;
		toWorkspaceId: string;
		agent?: string;
		note?: string;
	}): Promise<CityHandover> {
		const agent = this.liveAgents().find(
			(a) => a.terminalId === input.terminalId,
		);
		if (!agent) throw new Error("That agent is no longer running");
		const busy = this.state.handovers.find(
			(h) =>
				h.fromTerminalId === agent.terminalId &&
				(h.status === "briefing" || h.status === "starting"),
		);
		if (busy) throw new Error("That agent is already handing its work over");
		const handover: CityHandover = {
			id: randomBytes(6).toString("hex"),
			fromTerminalId: agent.terminalId,
			fromLabel: agent.label,
			fromWorkspaceName: agent.workspaceName,
			requestedBy: "you",
			status: "briefing",
			createdAt: this.now(),
		};
		this.state.handovers.push(handover);
		return this.startBriefing(handover, agent, input);
	}

	/** You approve an agent's own request, choosing where its work goes. */
	async approveHandover(input: {
		id: string;
		toWorkspaceId: string;
		agent?: string;
		note?: string;
	}): Promise<CityHandover> {
		const handover = this.state.handovers.find((h) => h.id === input.id);
		if (!handover || handover.status !== "asked")
			throw new Error("That request is not waiting for an answer");
		const agent = this.liveAgents().find(
			(a) => a.terminalId === handover.fromTerminalId,
		);
		if (!agent) throw new Error("That agent is no longer running");
		handover.status = "briefing";
		return this.startBriefing(handover, agent, input);
	}

	async declineHandover(id: string): Promise<void> {
		const handover = this.state.handovers.find((h) => h.id === id);
		if (!handover || handover.status !== "asked")
			throw new Error("That request is not waiting for an answer");
		handover.status = "declined";
		this.save();
		const agent = this.liveAgents().find(
			(a) => a.terminalId === handover.fromTerminalId,
		);
		if (agent)
			await this.deps
				.send(
					agent,
					`[Paradev office] Your hand-over request was declined; keep working where you are. Reply only "${NO_REPLY}".`,
				)
				.catch(() => {});
	}

	/** Gives up on a hand-over still waiting for its brief. */
	cancelHandover(id: string): void {
		const handover = this.state.handovers.find((h) => h.id === id);
		if (!handover || handover.status !== "briefing")
			throw new Error(
				"Only a hand-over waiting for its brief can be cancelled",
			);
		handover.status = "failed";
		handover.error = "Cancelled";
		this.save();
	}

	private async startBriefing(
		handover: CityHandover,
		agent: CityAgentInfo,
		input: { toWorkspaceId: string; agent?: string; note?: string },
	): Promise<CityHandover> {
		const target = this.deps.workspace?.(input.toWorkspaceId);
		if (!target || !this.deps.startAgent) {
			handover.status = "failed";
			handover.error = "That workspace does not exist on this machine";
			this.save();
			throw new Error(handover.error);
		}
		if (input.toWorkspaceId === agent.workspaceId) {
			handover.status = "failed";
			handover.error = "Pick a different workspace from the agent's own";
			this.save();
			throw new Error(handover.error);
		}
		handover.toWorkspaceId = input.toWorkspaceId;
		handover.toWorkspaceName = target.name;
		handover.agent = input.agent ?? agent.agentId;
		if (input.note) handover.note = input.note;
		this.post(this.room(keyOf(this.placeOf(agent))), {
			fromId: agent.terminalId,
			toIds: [],
			text: `${agent.label} from ${agent.workspaceName} is writing a brief to hand its work to ${target.name} (${target.projectName})`,
			kind: "system",
		});
		this.save();
		try {
			await this.deps.send(
				agent,
				[
					`[Paradev office] Your work is being handed over to a new agent in "${target.name}" (project ${target.projectName}, folder ${target.path}).`,
					"Write a hand-over brief for it: what you were asked to do, what is done, what is left, the files and decisions that matter, and anything it must not redo.",
					`Start your reply with the line "${HANDOVER_BRIEF}" and mention nobody. After this, stop working on that task.`,
				].join("\n"),
			);
		} catch (error) {
			handover.status = "failed";
			handover.error = error instanceof Error ? error.message : String(error);
			this.save();
		}
		return handover;
	}

	private async finishHandover(
		handover: CityHandover,
		agent: CityAgentInfo,
		reply: string,
	): Promise<void> {
		const target = handover.toWorkspaceId
			? this.deps.workspace?.(handover.toWorkspaceId)
			: null;
		const start = this.deps.startAgent;
		if (!target || !start || !handover.toWorkspaceId) {
			handover.status = "failed";
			handover.error = "The target workspace is gone";
			this.save();
			return;
		}
		handover.brief = reply
			.replace(new RegExp(`^${HANDOVER_BRIEF}\\s*`, "i"), "")
			.trim();
		handover.status = "starting";
		this.save();
		const place = this.placeOf(agent);
		const placeName = this.deps.roomName(place.projectId, place.roomId) ?? "";
		const kind = handover.agent ?? agent.agentId;
		const agents = this.liveAgents();
		const together = handlesFor([
			...agents.filter((a) => {
				const p = this.placeOf(a);
				return p.projectId === place.projectId && p.roomId === place.roomId;
			}),
			{
				...agent,
				terminalId: "~new",
				agentId: kind,
				workspaceId: handover.toWorkspaceId,
				workspaceName: target.name,
			},
		]);
		const theirHandle = together.get(agent.terminalId) ?? agent.agentId;
		const prompt = [
			`[Paradev office] You take over work from ${agent.label}, who worked in "${agent.workspaceName}" (project ${agent.projectName}). You work in "${target.name}" (project ${target.projectName}, folder ${target.path}); stay in your own folder.`,
			`Their brief:\n${handover.brief}`,
			handover.note
				? `From the person running the office: ${handover.note}`
				: "",
			`You sit with them in "${placeName}". To ask them something, start a line with @${theirHandle}.`,
		]
			.filter(Boolean)
			.join("\n\n");
		try {
			const { terminalId } = await start(handover.toWorkspaceId, kind, prompt);
			handover.newTerminalId = terminalId;
			handover.status = "done";
			const home =
				target.projectId === place.projectId &&
				handover.toWorkspaceId === place.roomId;
			if (!home)
				this.state.seats.push({
					terminalId,
					workspaceId: handover.toWorkspaceId,
					projectId: place.projectId,
					roomId: place.roomId,
					since: this.now(),
				});
			this.post(this.room(keyOf(place)), {
				fromId: agent.terminalId,
				toIds: [],
				text: `${agent.label} handed its work to a new agent in ${target.name}, who sits here now`,
				kind: "system",
			});
			this.save();
			await this.deps
				.send(
					agent,
					`[Paradev office] Your work now continues in "${target.name}" (project ${target.projectName}) with a new agent sitting next to you. Stop working on it; answer its questions if it asks. Reply only "${NO_REPLY}".`,
				)
				.catch(() => {});
		} catch (error) {
			handover.status = "failed";
			handover.error = error instanceof Error ? error.message : String(error);
			this.save();
		}
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
		const briefing = this.state.handovers.find(
			(h) => h.fromTerminalId === agent.terminalId && h.status === "briefing",
		);
		if (handles.size < 2 && !briefing) return;
		const settle = this.deps.settleMs ?? 1000;
		if (settle > 0) await new Promise((r) => setTimeout(r, settle));
		const reply = (await this.deps.lastReply(agent))?.trim();
		if (!reply || this.lastRelayed.get(agent.terminalId) === reply) return;
		if (briefing) {
			this.lastRelayed.set(agent.terminalId, reply);
			await this.finishHandover(briefing, agent, reply);
			return;
		}
		const asked = handoverRequest(reply);
		if (
			asked &&
			!this.state.handovers.some(
				(h) =>
					h.fromTerminalId === agent.terminalId &&
					(h.status === "asked" ||
						h.status === "briefing" ||
						h.status === "starting"),
			)
		) {
			this.state.handovers.push({
				id: randomBytes(6).toString("hex"),
				fromTerminalId: agent.terminalId,
				fromLabel: agent.label,
				fromWorkspaceName: agent.workspaceName,
				requestedBy: "agent",
				request: asked,
				status: "asked",
				createdAt: this.now(),
			});
			this.post(this.room(keyOf(place)), {
				fromId: agent.terminalId,
				toIds: [],
				text: `${agent.label} from ${agent.workspaceName} asks to hand its work over: ${asked}`,
				kind: "system",
			});
			this.save();
		}
		if (handles.size < 2 || saysNoReply(reply)) return;
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
		await this.deliver(
			place,
			name,
			handles,
			agents.filter((a) => targets.includes(a.terminalId)),
			`[from @${handle} in "${name}": ${agent.label} working in "${agent.workspaceName}", project ${agent.projectName}]\n${body}\n\n(Answer by starting a line with @${handle}. If you have nothing more for them, write only "${NO_REPLY}".)`,
		);
	}

	/**
	 * Types the text into each agent's terminal, led by a note about the room when the agent has not
	 * been told who sits there now. A failed delivery is noted in the room.
	 */
	private async deliver(
		place: { projectId: string; roomId: string },
		roomName: string,
		handles: Map<string, string>,
		to: CityAgentInfo[],
		text: string,
	): Promise<void> {
		const key = keyOf(place);
		const room = this.room(key);
		const agents = this.liveAgents();
		const people = [...handles.values()].sort().join(",");
		const results = await Promise.allSettled(
			to.map((agent) => {
				const before = this.told.get(agent.terminalId);
				const note =
					before?.key !== key
						? this.intro(agent, roomName, handles, agents)
						: before.people !== people
							? `[Paradev office] Now in "${roomName}": ${this.roster(agent, handles, agents)}.`
							: null;
				this.told.set(agent.terminalId, { key, people });
				return this.deps.send(agent, note ? `${note}\n\n${text}` : text);
			}),
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

	private intro(
		agent: CityAgentInfo,
		roomName: string,
		handles: Map<string, string>,
		agents: CityAgentInfo[],
	): string {
		return [
			`[Paradev office] You sit in "${roomName}" as @${handles.get(agent.terminalId)}, with ${this.roster(agent, handles, agents)}.`,
			"Your own workspace, folder and branch are unchanged; keep working there.",
			`To talk to someone here, start a line with their @handle (@all for everyone). When you have nothing more for them, write only "${NO_REPLY}" and mention nobody.`,
			`If your work belongs in another workspace or project, write a line "${HANDOVER_REQUEST} <where> - <why>"; the person running the office decides.`,
		].join("\n");
	}

	/** The others in the room with their @handles and where they work. */
	private roster(
		agent: CityAgentInfo,
		handles: Map<string, string>,
		agents: CityAgentInfo[],
	): string {
		const others = agents
			.filter(
				(a) => handles.has(a.terminalId) && a.terminalId !== agent.terminalId,
			)
			.map(
				(a) =>
					`@${handles.get(a.terminalId)} (${a.label}, working in "${a.workspaceName}", project ${a.projectName})`,
			);
		return others.length > 0 ? others.join(", ") : "nobody else";
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

	/**
	 * The running agents. A seat follows its agent into the terminal it continued in after a
	 * restart; a seat whose agent is gone is kept a while for that, then dropped.
	 */
	private liveAgents(): CityAgentInfo[] {
		const agents = this.deps.agents();
		const live = new Set(agents.map((a) => a.terminalId));
		let changed = false;
		const seats = this.state.seats.flatMap((seat) => {
			if (live.has(seat.terminalId)) {
				if (seat.missingSince === undefined) return [seat];
				changed = true;
				const { missingSince: _gone, ...back } = seat;
				return [back];
			}
			const next = seat.workspaceId
				? this.deps.successorOf?.(seat.terminalId, seat.workspaceId)
				: undefined;
			if (next && live.has(next)) {
				changed = true;
				const { missingSince: _gone, ...moved } = seat;
				return [{ ...moved, terminalId: next }];
			}
			if (seat.missingSince === undefined) {
				changed = true;
				return [{ ...seat, missingSince: this.now() }];
			}
			if (this.now() - seat.missingSince < SEAT_KEPT_MS) return [seat];
			changed = true;
			return [];
		});
		if (changed) {
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

/** What an agent asked for in a "HANDOVER REQUEST:" line, if it wrote one. */
export function handoverRequest(reply: string): string | null {
	for (const line of reply.split("\n")) {
		const clean = line.trim().replace(/^[*_`]+|[*_`]+$/g, "");
		if (clean.toUpperCase().startsWith(HANDOVER_REQUEST))
			return clean.slice(HANDOVER_REQUEST.length).trim() || null;
	}
	return null;
}

export function saysNoReply(reply: string): boolean {
	return reply.split("\n").some((line) =>
		/^\(?no reply\)?[.!]?$/.test(
			line
				.trim()
				.replace(/[*_`"]/g, "")
				.toLowerCase(),
		),
	);
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
	if (!existsSync(path)) return { seats: [], rooms: {}, handovers: [] };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CityState>;
		return {
			seats: parsed.seats ?? [],
			rooms: parsed.rooms ?? {},
			handovers: parsed.handovers ?? [],
		};
	} catch {
		return { seats: [], rooms: {}, handovers: [] };
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
