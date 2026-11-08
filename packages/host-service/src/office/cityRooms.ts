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

/** A running agent with the name the city gave it, or the one a person chose. */
export interface NamedAgent extends CityAgentInfo {
	name: string;
}

/** An agent's name; kept a while after its agent stops, like a seat, and follows it after a restart. */
export interface CityName {
	terminalId: string;
	workspaceId: string;
	name: string;
	/** Set once the agent was told this name; a rename clears it. */
	told?: boolean;
	missingSince?: number;
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
	names: CityName[];
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
	/** Each running agent's name and the @handle it answers to. */
	names: Array<{ terminalId: string; name: string; handle: string }>;
	rooms: CityRoomSnapshot[];
	maxRelays: number;
	handovers: CityHandover[];
	/** Rooms of the office an agent can sit in, as the place `{ projectId: "office", roomId }`. */
	officeRooms: Array<{ id: string; name: string }>;
}

export interface CityRoomsDeps {
	statePath: string;
	agents: () => CityAgentInfo[];
	/** The room's name, or null when the project has no such room. */
	roomName: (projectId: string, roomId: string) => string | null;
	send: (agent: CityAgentInfo, text: string) => Promise<void>;
	/** The agent's last answer, read when its turn ends. */
	lastReply: (agent: CityAgentInfo) => Promise<string | null>;
	/** The office, for agents seated in its rooms (`projectId` {@link OFFICE}). */
	office?: {
		rooms: () => Array<{ id: string; name: string }>;
		sync: (
			guests: Array<
				Pick<
					NamedAgent,
					| "terminalId"
					| "name"
					| "workspaceId"
					| "agentId"
					| "label"
					| "workspaceName"
					| "projectName"
				> & { roomId: string }
			>,
		) => void;
		turnEnded: (terminalId: string, reply: string) => Promise<void>;
	};
	/** A workspace on this host, or null when there is none with that id. */
	workspace?: (workspaceId: string) => {
		projectId: string;
		name: string;
		projectName: string;
		path: string;
		branch?: string | null;
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
/** The `projectId` of a place in the office rather than in a project's building. */
export const OFFICE = "office";
export const MAX_RELAYS = 8;
/** A seat whose agent stopped running is kept this long, in case it comes back in a new terminal. */
export const SEAT_KEPT_MS = 24 * 60 * 60 * 1000;
/** What an agent writes to end its part in a room's talk; such an answer is never passed on. */
export const NO_REPLY = "no reply";
export const HANDOVER_REQUEST = "HANDOVER REQUEST:";
const HANDOVER_BRIEF = "HANDOVER BRIEF";
export const MAX_NAME_CHARS = 24;
/** Handles that mean everyone in a room, so no agent can be called that. */
const RESERVED_HANDLES = new Set(["all", "everyone"]);
/** Names given to agents in order, skipping any already in use. */
export const AGENT_NAMES = [
	"Ada",
	"Milo",
	"Iris",
	"Otto",
	"Nova",
	"Leo",
	"Mira",
	"Felix",
	"Luna",
	"Hugo",
	"Zara",
	"Theo",
	"Ruby",
	"Arlo",
	"Nina",
	"Kai",
	"Ivy",
	"Omar",
	"Lena",
	"Jude",
	"Cleo",
	"Remy",
	"Tess",
	"Ezra",
	"Maya",
	"Finn",
	"Sage",
	"Rafa",
	"Elsa",
	"Nico",
	"Wren",
	"Juno",
	"Pablo",
	"Yuki",
	"Ines",
	"Bram",
	"Lola",
	"Sami",
	"Vera",
	"Tomas",
	"Anya",
	"Dex",
	"Noor",
	"Oren",
	"Pia",
	"Raj",
	"Suki",
	"Ulla",
];
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
			if (projectId === OFFICE) continue;
			const name = this.nameOf(projectId, roomId);
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
			names: agents.map((a) => ({
				terminalId: a.terminalId,
				name: a.name,
				handle: handleOf(a),
			})),
			rooms,
			maxRelays: MAX_RELAYS,
			handovers: this.state.handovers,
			officeRooms: this.deps.office?.rooms() ?? [],
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
		const name = this.nameOf(projectId, roomId);
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
				? `${agent.name} came back to its own desk`
				: `${agent.name} from ${agent.workspaceName} sat down here`,
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
		const name = this.nameOf(projectId, roomId);
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
			fromLabel: agent.name,
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
		agent: NamedAgent,
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
			text: `${agent.name} from ${agent.workspaceName} is writing a brief to hand its work to ${target.name} (${target.projectName})`,
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
		agent: NamedAgent,
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
		const placeName = this.nameOf(place.projectId, place.roomId) ?? "";
		const kind = handover.agent ?? agent.agentId;
		const theirHandle =
			this.handles(place.projectId, place.roomId, this.liveAgents()).get(
				agent.terminalId,
			) ?? handleOf(agent);
		const newName = this.freeName();
		const prompt = [
			this.identity({
				name: newName,
				workspaceName: target.name,
				projectName: target.projectName,
				branch: target.branch,
			}),
			`You take over work from ${agent.name} (${agent.label}), who worked in "${agent.workspaceName}" (project ${agent.projectName}). You work in folder ${target.path}; stay in your own folder.`,
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
			this.state.names.push({
				terminalId,
				workspaceId: handover.toWorkspaceId,
				name: newName,
				told: true,
			});
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
				text: `${agent.name} handed its work to ${newName}, a new agent in ${target.name}, who sits here now`,
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
		const inOffice = place.projectId === OFFICE;
		if (handles.size < 2 && !briefing && !inOffice) return;
		const settle = this.deps.settleMs ?? 1000;
		if (settle > 0) await new Promise((r) => setTimeout(r, settle));
		const reply = (await this.deps.lastReply(agent))?.trim();
		if (!reply || this.lastRelayed.get(agent.terminalId) === reply) return;
		if (briefing) {
			this.lastRelayed.set(agent.terminalId, reply);
			await this.finishHandover(briefing, agent, reply);
			return;
		}
		if (inOffice) {
			this.lastRelayed.set(agent.terminalId, reply);
			await this.deps.office?.turnEnded(agent.terminalId, reply);
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
				fromLabel: agent.name,
				fromWorkspaceName: agent.workspaceName,
				requestedBy: "agent",
				request: asked,
				status: "asked",
				createdAt: this.now(),
			});
			this.post(this.room(keyOf(place)), {
				fromId: agent.terminalId,
				toIds: [],
				text: `${agent.name} from ${agent.workspaceName} asks to hand its work over: ${asked}`,
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
		const name = this.nameOf(place.projectId, place.roomId) ?? "";
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
			`[from @${handle} in "${name}": ${agent.name}, a ${agent.label} agent working in "${agent.workspaceName}", project ${agent.projectName}]\n${body}\n\n(Answer by starting a line with @${handle}. If you have nothing more for them, write only "${NO_REPLY}".)`,
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
		to: NamedAgent[],
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
				return this.sendAs(agent, note ? `${note}\n\n${text}` : text);
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
		agent: NamedAgent,
		roomName: string,
		handles: Map<string, string>,
		agents: NamedAgent[],
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
		agent: NamedAgent,
		handles: Map<string, string>,
		agents: NamedAgent[],
	): string {
		const others = agents
			.filter(
				(a) => handles.has(a.terminalId) && a.terminalId !== agent.terminalId,
			)
			.map(
				(a) =>
					`@${handles.get(a.terminalId)} (${a.name}, a ${a.label} agent working in "${a.workspaceName}", project ${a.projectName})`,
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

	/** Who is in a room and their @handles, made from their names. */
	private handles(
		projectId: string,
		roomId: string,
		agents: NamedAgent[],
	): Map<string, string> {
		const here = agents.filter((a) => {
			const place = this.placeOf(a);
			return place.projectId === projectId && place.roomId === roomId;
		});
		return handlesFor(here);
	}

	/**
	 * The running agents, each with its name; a newcomer gets the first free one. A seat or a name
	 * follows its agent into the terminal it continued in after a restart; one whose agent is gone is
	 * kept a while for that, then dropped.
	 */
	private liveAgents(): NamedAgent[] {
		const agents = this.deps.agents();
		const live = new Set(agents.map((a) => a.terminalId));
		const seats = this.follow(this.state.seats, live);
		const names = this.follow(this.state.names, live);
		let changed = seats.changed || names.changed;
		this.state.seats = seats.list;
		this.state.names = names.list;
		const nameOf = new Map(this.state.names.map((n) => [n.terminalId, n.name]));
		const named = agents.map((agent) => {
			let name = nameOf.get(agent.terminalId);
			if (!name) {
				name = this.freeName();
				this.state.names.push({
					terminalId: agent.terminalId,
					workspaceId: agent.workspaceId,
					name,
				});
				nameOf.set(agent.terminalId, name);
				changed = true;
			}
			return { ...agent, name };
		});
		if (changed) this.save();
		if (this.deps.office) {
			const byId = new Map(named.map((a) => [a.terminalId, a]));
			this.deps.office.sync(
				this.state.seats.flatMap((seat) => {
					const agent = byId.get(seat.terminalId);
					return seat.projectId === OFFICE && agent
						? [{ ...agent, roomId: seat.roomId }]
						: [];
				}),
			);
		}
		return named;
	}

	/**
	 * Moves entries whose agent continued in a new terminal, and drops those gone too long. An entry
	 * moved onto a terminal replaces any other entry that terminal had.
	 */
	private follow<
		T extends {
			terminalId: string;
			workspaceId?: string;
			missingSince?: number;
		},
	>(list: T[], live: Set<string>): { list: T[]; changed: boolean } {
		let changed = false;
		const moved: T[] = [];
		const stayed = list.flatMap((entry): T[] => {
			if (live.has(entry.terminalId)) {
				if (entry.missingSince === undefined) return [entry];
				changed = true;
				return [{ ...entry, missingSince: undefined }];
			}
			const successor = entry.workspaceId
				? this.deps.successorOf?.(entry.terminalId, entry.workspaceId)
				: undefined;
			if (
				successor &&
				live.has(successor) &&
				!moved.some((m) => m.terminalId === successor)
			) {
				changed = true;
				moved.push({
					...entry,
					terminalId: successor,
					missingSince: undefined,
				});
				return [];
			}
			if (entry.missingSince === undefined) {
				changed = true;
				return [{ ...entry, missingSince: this.now() }];
			}
			if (this.now() - entry.missingSince < SEAT_KEPT_MS) return [entry];
			changed = true;
			return [];
		});
		const takenOver = new Set(moved.map((m) => m.terminalId));
		return {
			list: [
				...stayed.filter((entry) => !takenOver.has(entry.terminalId)),
				...moved,
			].map(withoutUndefined),
			changed,
		};
	}

	/** The first name of {@link AGENT_NAMES} no agent has, or one with a number. */
	private freeName(): string {
		const taken = new Set(this.state.names.map((n) => slug(n.name)));
		for (let n = 1; ; n++)
			for (const base of AGENT_NAMES) {
				const name = n === 1 ? base : `${base} ${n}`;
				if (!taken.has(slug(name))) return name;
			}
	}

	/** Who an agent is, said before the first thing the city types into its terminal. */
	private identity(who: {
		name: string;
		label?: string;
		workspaceName: string;
		projectName: string;
		branch?: string | null;
	}): string {
		const what = who.label ? `, a ${who.label} agent` : "";
		const branch = who.branch ? ` (branch ${who.branch})` : "";
		return `[Paradev office] You are ${who.name} (@${slug(who.name)})${what} working in workspace "${who.workspaceName}"${branch} of project ${who.projectName}. When someone asks who you are, use this name.`;
	}

	/** Sends to an agent, led by who it is when it has not been told its current name. */
	private async sendAs(agent: NamedAgent, text: string): Promise<void> {
		const entry = this.state.names.find(
			(n) => n.terminalId === agent.terminalId,
		);
		const intro = entry?.told
			? null
			: this.identity({
					...agent,
					branch: this.deps.workspace?.(agent.workspaceId)?.branch,
				});
		await this.deps.send(agent, intro ? `${intro}\n\n${text}` : text);
		if (entry && !entry.told) {
			entry.told = true;
			this.save();
		}
	}

	/** A person's direct message to one agent. */
	async tell(terminalId: string, text: string): Promise<void> {
		const agent = this.liveAgents().find((a) => a.terminalId === terminalId);
		if (!agent) throw new Error("That agent is no longer running");
		await this.sendAs(agent, text);
	}

	/**
	 * Starts a CLI in a workspace under a new name. It is told who it is right away, with its first
	 * task when there is one, else asked to say who it is.
	 */
	async start(input: {
		workspaceId: string;
		agent: string;
		prompt: string;
	}): Promise<{ terminalId: string; name: string }> {
		const target = this.deps.workspace?.(input.workspaceId);
		if (!target || !this.deps.startAgent)
			throw new Error("That workspace does not exist on this machine");
		this.liveAgents();
		const name = this.freeName();
		const task = input.prompt.trim();
		const prompt = [
			this.identity({ ...target, name, workspaceName: target.name }),
			task ||
				"Nothing to do yet. Reply with one short line saying who you are, then wait.",
		].join("\n\n");
		const { terminalId } = await this.deps.startAgent(
			input.workspaceId,
			input.agent,
			prompt,
		);
		this.state.names = this.state.names.filter(
			(n) => n.terminalId !== terminalId,
		);
		this.state.names.push({
			terminalId,
			workspaceId: input.workspaceId,
			name,
			told: true,
		});
		this.save();
		return { terminalId, name };
	}

	/** Renames an agent; it is told its new name with the next message the city gives it. */
	rename(terminalId: string, wanted: string): void {
		const name = wanted.trim().replace(/\s+/g, " ");
		if (!name || name.length > MAX_NAME_CHARS)
			throw new Error(`A name is 1 to ${MAX_NAME_CHARS} characters`);
		const handle = slug(name);
		if (!handle) throw new Error("A name needs a letter or a digit");
		if (RESERVED_HANDLES.has(handle))
			throw new Error(`"${name}" is kept for talking to everyone`);
		const agent = this.liveAgents().find((a) => a.terminalId === terminalId);
		const entry = this.state.names.find((n) => n.terminalId === terminalId);
		if (!agent || !entry) throw new Error("That agent is no longer running");
		if (this.state.names.some((n) => n !== entry && slug(n.name) === handle))
			throw new Error(`Another agent is already called ${name}`);
		if (entry.name === name) return;
		const before = entry.name;
		entry.name = name;
		entry.told = false;
		this.post(this.room(keyOf(this.placeOf(agent))), {
			fromId: terminalId,
			toIds: [],
			text: `${before} is now called ${name}`,
			kind: "system",
		});
		this.save();
	}

	/** A room's name: an office room, or one of a project's rooms. */
	private nameOf(projectId: string, roomId: string): string | null {
		if (projectId === OFFICE)
			return (
				this.deps.office?.rooms().find((r) => r.id === roomId)?.name ?? null
			);
		return this.deps.roomName(projectId, roomId);
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

/** An agent's @handle: its name in lower case, words joined by "-". */
export function handleOf(agent: Pick<NamedAgent, "name" | "agentId">): string {
	return slug(agent.name) || slug(agent.agentId) || "agent";
}

/** The @handles of agents sitting together; a clash, which renaming prevents, gets a number. */
export function handlesFor(agents: NamedAgent[]): Map<string, string> {
	const handles = new Map<string, string>();
	const taken = new Set<string>();
	const ordered = [...agents].sort((a, b) =>
		a.terminalId.localeCompare(b.terminalId),
	);
	for (const a of ordered) {
		let handle = handleOf(a);
		for (let n = 2; taken.has(handle); n++) handle = `${handleOf(a)}-${n}`;
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

function withoutUndefined<T extends object>(entry: T): T {
	return Object.fromEntries(
		Object.entries(entry).filter(([, value]) => value !== undefined),
	) as T;
}

function keyOf(place: { projectId: string; roomId: string }): string {
	return `${place.projectId}/${place.roomId}`;
}

function parseKey(key: string): { projectId: string; roomId: string } {
	const [projectId = "", roomId = ""] = key.split("/");
	return { projectId, roomId };
}

function load(path: string): CityState {
	if (!existsSync(path))
		return { seats: [], names: [], rooms: {}, handovers: [] };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CityState>;
		return {
			seats: parsed.seats ?? [],
			names: parsed.names ?? [],
			rooms: parsed.rooms ?? {},
			handovers: parsed.handovers ?? [],
		};
	} catch {
		return { seats: [], names: [], rooms: {}, handovers: [] };
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
