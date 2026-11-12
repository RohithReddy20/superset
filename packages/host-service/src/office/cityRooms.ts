import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { AgentIdentityId } from "@superset/shared/agent-catalog";

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
	/** The {@link teamCommands} the agent was told last; it is told again when they change. */
	briefed?: string | boolean;
	/** The model and effort the person chose when starting it; unset means the CLI's own default. */
	model?: string;
	effort?: string;
	missingSince?: number;
}

/** The model and effort an agent is started with; unset means the CLI's own default. */
export interface CityLaunchOptions {
	model?: string;
	effort?: string;
}

/** An agent whose terminal stopped under it: a restart, a crash or a reboot. */
export interface LostAgent {
	terminalId: string;
	workspaceId: string;
	agentId: AgentIdentityId;
	startedAt: number;
	/** When its terminal was first seen gone. */
	since: number;
	/** Whether its conversation can continue in a new terminal. */
	resumable: boolean;
}

export interface CityLostAgent extends LostAgent {
	name: string;
	handle: string;
	model?: string;
	effort?: string;
	/** Set while it starts again in a new terminal. */
	reconnecting?: boolean;
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

/**
 * Work moving to another workspace: the agent writes a brief, a new agent starts in the target
 * workspace with it and sits where the first one sits. An agent may hand its own work on.
 */
export interface CityHandover {
	id: string;
	fromTerminalId: string;
	fromLabel: string;
	fromWorkspaceName: string;
	requestedBy: "you" | "agent";
	toWorkspaceId?: string;
	toWorkspaceName?: string;
	/** The agent kind to start there, "claude" or "codex". */
	agent?: string;
	note?: string;
	status: "briefing" | "starting" | "done" | "failed";
	brief?: string;
	newTerminalId?: string;
	error?: string;
	createdAt: number;
}

interface CityState {
	seats: CitySeat[];
	names: CityName[];
	handovers: CityHandover[];
}

export interface CityRoomSnapshot {
	projectId: string;
	roomId: string;
	name: string;
	members: Array<{ terminalId: string; handle: string }>;
}

export interface CityRoomRef {
	projectId: string;
	roomId: string;
	name: string;
	memberIds: string[];
}

export interface CitySnapshot {
	seats: CitySeat[];
	/** Each running agent's name and the @handle it answers to. */
	names: Array<{
		terminalId: string;
		name: string;
		handle: string;
		model?: string;
		effort?: string;
	}>;
	rooms: CityRoomSnapshot[];
	/** The name the next agent gets when the person gives none. */
	nextName: string;
	handovers: CityHandover[];
	/** Named agents whose terminal stopped; they keep their seat until they are reconnected or removed. */
	lost: CityLostAgent[];
}

export interface CityRoomsDeps {
	statePath: string;
	agents: () => CityAgentInfo[];
	/** The room's name, or null when the project has no such room. */
	roomName: (projectId: string, roomId: string) => string | null;
	send: (agent: CityAgentInfo, text: string) => Promise<void>;
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
		options?: CityLaunchOptions,
	) => Promise<{ terminalId: string }>;
	/** The terminal an agent continued in after its terminal was restarted, if any. */
	successorOf?: (terminalId: string, workspaceId: string) => string | undefined;
	/** Agents whose terminal stopped under them; the city shows the ones it named. */
	lostAgents?: () => LostAgent[];
	/** Continues a lost agent's conversation in a new terminal. */
	resumeAgent?: (agent: LostAgent) => Promise<{ terminalId: string }>;
	/** Ends an agent and closes its terminal. */
	stopAgent?: (terminalId: string, workspaceId: string) => Promise<void>;
	/** A workspace's id from its id or its name; null when none or several match. */
	findWorkspace?: (query: string) => string | null;
	/** Defaults to {@link OFFICE_CLI}. */
	officeCli?: string;
	now?: () => number;
	/** Called after the saved state changed. */
	onChange?: () => void;
}

export const MEETING_ROOM = "meeting";
/** A seat whose agent stopped running is kept this long, in case it comes back in a new terminal. */
export const SEAT_KEPT_MS = 24 * 60 * 60 * 1000;
/** How long a reconnected agent shows as reconnecting before its new terminal reports in. */
const RECONNECT_SHOWN_MS = 60_000;
export const MAX_NAME_CHARS = 24;
/** The shell command agents and people reach the team with. */
export const OFFICE_CLI = "superset office";

/**
 * How an agent works with the team. It is told with the first thing the city says to it, and again
 * when the commands changed since.
 */
export const teamCommands = (cli: string): string =>
	`You work with the person (@you) and the other agents as equals. Run these in your shell: \`${cli} who\` lists everyone and what each carries; \`${cli} say @name "..."\` writes to someone, \`say @room "..."\` to everyone sitting in your room; \`${cli} ask @name "..."\` asks for something and puts it on their list; \`${cli} todo add "..."\`, \`todo start <id>\`, \`todo finish <id>\`, \`todo drop <id>\` and \`todo list\` keep your own list. When the room agreed on something, write it down once for everyone with \`${cli} decide "<what was decided>" --give "@name: what they took"\` (repeat --give; a --give for yourself goes on your own list). If your work belongs in another workspace, hand it on yourself with \`${cli} handover <workspace> "<brief: what was asked, what is done, what is left, what matters>"\`: a new agent starts there with your brief.`;
/** Handles that mean a group or the person, so no agent can be called that. */
const RESERVED_HANDLES = new Set(["all", "everyone", "room", "you"]);
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

/**
 * Where CLI agents sit in the city, their names, and work handed to another workspace. Seating
 * never changes an agent's workspace.
 */
export class CityRooms {
	private state: CityState;
	/** Agents started again in a new terminal, by that terminal, until it reports in. */
	private readonly reconnecting = new Map<
		string,
		{ agent: CityLostAgent; at: number }
	>();
	private readonly now: () => number;

	constructor(private readonly deps: CityRoomsDeps) {
		this.now = deps.now ?? Date.now;
		this.state = load(deps.statePath);
	}

	snapshot(): CitySnapshot {
		const agents = this.liveAgents();
		const keys = new Set<string>();
		for (const agent of agents) keys.add(keyOf(this.placeOf(agent)));
		const rooms: CityRoomSnapshot[] = [];
		for (const key of keys) {
			const { projectId, roomId } = parseKey(key);
			const name = this.nameOf(projectId, roomId);
			if (!name) continue;
			const members = this.handles(projectId, roomId, agents);
			rooms.push({
				projectId,
				roomId,
				name,
				members: [...members].map(([terminalId, handle]) => ({
					terminalId,
					handle,
				})),
			});
		}
		const live = new Set(agents.map((a) => a.terminalId));
		const lost = this.lost(live);
		const shown = new Set([...live, ...lost.map((a) => a.terminalId)]);
		return {
			seats: this.state.seats.filter((s) => shown.has(s.terminalId)),
			names: agents.map((a) => ({
				terminalId: a.terminalId,
				name: a.name,
				handle: handleOf(a),
				...this.launchOf(a.terminalId),
			})),
			rooms,
			nextName: this.freeName(),
			handovers: this.state.handovers,
			lost,
		};
	}

	/** Named agents whose terminal stopped, and those starting again in a new one. */
	private lost(live: Set<string>): CityLostAgent[] {
		const nameOf = new Map(this.state.names.map((n) => [n.terminalId, n.name]));
		const lost = (this.deps.lostAgents?.() ?? []).flatMap((agent) => {
			const name = nameOf.get(agent.terminalId);
			return name
				? [
						{
							...agent,
							name,
							handle: handleOf({ ...agent, name }),
							...this.launchOf(agent.terminalId),
						},
					]
				: [];
		});
		for (const [terminalId, { agent, at }] of this.reconnecting) {
			if (live.has(terminalId) || this.now() - at > RECONNECT_SHOWN_MS)
				this.reconnecting.delete(terminalId);
			else lost.push(agent);
		}
		return lost;
	}

	/**
	 * Continues a lost agent's conversation in a new terminal. It keeps its name, seat and room;
	 * its task follows it there.
	 */
	async reconnect(terminalId: string): Promise<{ terminalId: string }> {
		const agent = this.lost(new Set()).find(
			(a) => a.terminalId === terminalId && !a.reconnecting,
		);
		if (!agent) throw new Error("That agent is not disconnected");
		if (!agent.resumable || !this.deps.resumeAgent)
			throw new Error(
				`${agent.name}'s conversation can't continue in a new terminal`,
			);
		const next = await this.deps.resumeAgent(agent);
		for (const entry of [...this.state.names, ...this.state.seats]) {
			if (entry.terminalId !== terminalId) continue;
			entry.terminalId = next.terminalId;
			delete entry.missingSince;
		}
		this.reconnecting.set(next.terminalId, {
			agent: { ...agent, terminalId: next.terminalId, reconnecting: true },
			at: this.now(),
		});
		this.save();
		return next;
	}

	/** Named agents whose binding ended, so they are not among the running ones, and that can continue. */
	away(): Array<
		Pick<CityLostAgent, "terminalId" | "workspaceId" | "name" | "handle">
	> {
		const live = new Set(this.liveAgents().map((a) => a.terminalId));
		return this.lost(live).filter(
			(a) => a.resumable && !a.reconnecting && !live.has(a.terminalId),
		);
	}

	/** Ends an agent for good, running or not, and takes it out of the city. */
	async remove(terminalId: string): Promise<void> {
		const agent =
			this.lost(new Set()).find(
				(a) => a.terminalId === terminalId && !a.reconnecting,
			) ?? this.liveAgents().find((a) => a.terminalId === terminalId);
		if (!agent) throw new Error("That agent is already gone");
		await this.deps.stopAgent?.(terminalId, agent.workspaceId);
		this.state.names = this.state.names.filter(
			(n) => n.terminalId !== terminalId,
		);
		this.state.seats = this.state.seats.filter(
			(s) => s.terminalId !== terminalId,
		);
		this.save();
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
		this.save();
	}

	async sendHome(terminalId: string): Promise<void> {
		const agent = this.liveAgents().find((a) => a.terminalId === terminalId);
		if (!agent) throw new Error("That agent is no longer running");
		await this.seat(terminalId, agent.projectId, agent.workspaceId);
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

	/** A workspace by its id or, when only one has it, its name. */
	workspaceIdFor(query: string): string {
		const id = this.deps.findWorkspace?.(query.trim());
		if (!id)
			throw new Error(
				`No single workspace here is "${query.trim()}"; use its id`,
			);
		return id;
	}

	/** The agent hands its work on itself, with the brief it wrote: a new agent starts in the other workspace. */
	async handOverWithBrief(input: {
		terminalId: string;
		toWorkspaceId: string;
		agent?: string;
		brief: string;
	}): Promise<CityHandover> {
		const agent = this.liveAgents().find(
			(a) => a.terminalId === input.terminalId,
		);
		if (!agent) throw new Error("Only a running agent hands its work over");
		if (!input.brief.trim()) throw new Error("A hand-over needs a brief");
		let handover = this.state.handovers.find(
			(h) =>
				h.fromTerminalId === agent.terminalId &&
				h.status === "briefing" &&
				h.toWorkspaceId === input.toWorkspaceId,
		);
		if (!handover) {
			const target = this.deps.workspace?.(input.toWorkspaceId);
			if (!target)
				throw new Error("That workspace does not exist on this machine");
			if (input.toWorkspaceId === agent.workspaceId)
				throw new Error("Pick a different workspace from your own");
			handover = {
				id: randomBytes(6).toString("hex"),
				fromTerminalId: agent.terminalId,
				fromLabel: agent.name,
				fromWorkspaceName: agent.workspaceName,
				requestedBy: "agent",
				toWorkspaceId: input.toWorkspaceId,
				toWorkspaceName: target.name,
				status: "briefing",
				createdAt: this.now(),
			};
			this.state.handovers.push(handover);
		}
		if (input.agent) handover.agent = input.agent;
		await this.finishHandover(handover, agent, input.brief);
		if (handover.status === "failed")
			throw new Error(handover.error ?? "The hand-over failed");
		return handover;
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
		this.save();
		try {
			await this.deps.send(
				agent,
				[
					`[Paradev office] Your work is being handed over to a new agent in "${target.name}" (project ${target.projectName}, folder ${target.path}).`,
					"Write a hand-over brief for it: what you were asked to do, what is done, what is left, the files and decisions that matter, and anything it must not redo.",
					`Give it with this command, then stop working on that task: ${this.cli()} handover ${input.toWorkspaceId} "<your brief>"`,
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
		brief: string,
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
		handover.brief = brief.trim();
		handover.status = "starting";
		this.save();
		const place = this.placeOf(agent);
		const placeName = this.nameOf(place.projectId, place.roomId) ?? "";
		const kind = handover.agent ?? agent.agentId;
		const launch =
			kind === agent.agentId ? this.launchOf(agent.terminalId) : {};
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
			this.brief(),
			`You take over work from ${agent.name} (${agent.label}), who worked in "${agent.workspaceName}" (project ${agent.projectName}). You work in folder ${target.path}; stay in your own folder.`,
			`Their brief:\n${handover.brief}`,
			handover.note
				? `From the person running the office: ${handover.note}`
				: "",
			`You sit with them in "${placeName}". To ask them something: ${this.cli()} ask @${theirHandle} "..."`,
		]
			.filter(Boolean)
			.join("\n\n");
		try {
			const { terminalId } = await start(
				handover.toWorkspaceId,
				kind,
				prompt,
				launch,
			);
			this.state.names.push({
				terminalId,
				workspaceId: handover.toWorkspaceId,
				name: newName,
				told: true,
				briefed: this.brief(),
				...launch,
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
			this.save();
		} catch (error) {
			handover.status = "failed";
			handover.error = error instanceof Error ? error.message : String(error);
			this.save();
		}
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
	/** The room an agent sits in and who sits there with it, itself included. */
	roomOf(terminalId: string): CityRoomRef | null {
		const agents = this.liveAgents();
		const agent = agents.find((a) => a.terminalId === terminalId);
		return agent ? this.roomAt(this.placeOf(agent), agents) : null;
	}

	/** A room by its place, with who sits there; null when the project has no such room. */
	roomAt(
		place: { projectId: string; roomId: string },
		agents = this.liveAgents(),
	): CityRoomRef | null {
		const name = this.nameOf(place.projectId, place.roomId);
		if (!name) return null;
		return {
			projectId: place.projectId,
			roomId: place.roomId,
			name,
			memberIds: [
				...this.handles(place.projectId, place.roomId, agents).keys(),
			],
		};
	}

	private launchOf(terminalId: string): CityLaunchOptions {
		const entry = this.state.names.find((n) => n.terminalId === terminalId);
		return {
			...(entry?.model ? { model: entry.model } : {}),
			...(entry?.effort ? { effort: entry.effort } : {}),
		};
	}

	/** Running agents with their city names. */
	namedAgents(): NamedAgent[] {
		return this.liveAgents();
	}

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
	/** A name tidied and checked: its length, its handle, and that no other agent has it. */
	private checkedName(wanted: string, own?: CityName): string {
		const name = wanted.trim().replace(/\s+/g, " ");
		if (!name || name.length > MAX_NAME_CHARS)
			throw new Error(`A name is 1 to ${MAX_NAME_CHARS} characters`);
		const handle = slug(name);
		if (!handle) throw new Error("A name needs a letter or a digit");
		if (RESERVED_HANDLES.has(handle))
			throw new Error(`"${name}" is kept for talking to everyone`);
		if (this.state.names.some((n) => n !== own && slug(n.name) === handle))
			throw new Error(`Another agent is already called ${name}`);
		return name;
	}

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

	private cli(): string {
		return this.deps.officeCli ?? OFFICE_CLI;
	}

	private brief(): string {
		return teamCommands(this.cli());
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
		const brief = this.brief();
		const briefing =
			entry?.briefed === brief
				? null
				: entry?.briefed
					? `The team's commands changed. ${brief}`
					: brief;
		const lead = [intro, briefing].filter(Boolean);
		await this.deps.send(agent, [...lead, text].join("\n\n"));
		const now = this.state.names.find((n) => n.name === entry?.name);
		if (now && lead.length > 0) {
			now.told = true;
			now.briefed = brief;
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
		/** The name the person chose; a free one is given when unset. */
		name?: string;
		model?: string;
		effort?: string;
	}): Promise<{ terminalId: string; name: string }> {
		const target = this.deps.workspace?.(input.workspaceId);
		if (!target || !this.deps.startAgent)
			throw new Error("That workspace does not exist on this machine");
		this.liveAgents();
		const name = input.name?.trim()
			? this.checkedName(input.name)
			: this.freeName();
		const task = input.prompt.trim();
		const prompt = [
			this.identity({ ...target, name, workspaceName: target.name }),
			this.brief(),
			task ||
				"Nothing to do yet. Reply with one short line saying who you are, then wait.",
		].join("\n\n");
		const launch: CityLaunchOptions = {
			...(input.model ? { model: input.model } : {}),
			...(input.effort ? { effort: input.effort } : {}),
		};
		const { terminalId } = await this.deps.startAgent(
			input.workspaceId,
			input.agent,
			prompt,
			launch,
		);
		this.state.names = this.state.names.filter(
			(n) => n.terminalId !== terminalId,
		);
		this.state.names.push({
			terminalId,
			workspaceId: input.workspaceId,
			name,
			told: true,
			briefed: this.brief(),
			...launch,
		});
		this.save();
		return { terminalId, name };
	}

	/** Renames an agent; it is told its new name with the next message the city gives it. */
	rename(terminalId: string, wanted: string): void {
		const agent = this.liveAgents().find((a) => a.terminalId === terminalId);
		const entry = this.state.names.find((n) => n.terminalId === terminalId);
		if (!agent || !entry) throw new Error("That agent is no longer running");
		const name = this.checkedName(wanted, entry);
		if (entry.name === name) return;
		entry.name = name;
		entry.told = false;
		this.save();
	}

	private nameOf(projectId: string, roomId: string): string | null {
		return this.deps.roomName(projectId, roomId);
	}

	private save(): void {
		writeFileSync(this.deps.statePath, JSON.stringify(this.state, null, "\t"));
		this.deps.onChange?.();
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
	if (!existsSync(path)) return { seats: [], names: [], handovers: [] };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CityState>;
		return {
			seats: parsed.seats ?? [],
			names: parsed.names ?? [],
			handovers: parsed.handovers ?? [],
		};
	} catch {
		return { seats: [], names: [], handovers: [] };
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
