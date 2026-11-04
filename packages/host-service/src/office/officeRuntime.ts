import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	adapterEntry,
	type EngineLaunch,
	handleMcpRequest,
	Office,
	Seat,
} from "@superset/office-harness";
import { ACP_HARNESSES, UNGATED_VERSION } from "../chat-v3/acpCatalogue";
import { resolveAgentCli } from "../chat-v3/agentCli";
import { buildChatAgentEnv } from "../chat-v3/agentEnv";
import type { HostDb } from "../db";
import type {
	OfficeConfig,
	OfficeEngine,
	OfficeLogLine,
	OfficeSeatConfig,
	OfficeSnapshot,
} from "./types";

const LOG_LINES = 200;

export const DEFAULT_OFFICE_CONFIG: OfficeConfig = {
	rooms: [
		{
			id: "engineering",
			name: "engineering",
			members: ["you", "scout", "bash", "ledger"],
		},
		{ id: "planning", name: "planning", members: ["you", "scout", "bash"] },
	],
	humans: [{ id: "you", name: "You", role: "founder", room: "engineering" }],
	seats: [
		{
			id: "scout",
			name: "Scout",
			role: "research teammate: finds things out, drafts lists and summaries, pulls in Ledger to check numbers",
			room: "engineering",
			engine: "claude",
			model: "haiku",
		},
		{
			id: "bash",
			name: "Bash",
			role: "coding teammate: reads and changes code, runs tests, writes short briefs on what changed",
			room: "engineering",
			engine: "codex",
		},
		{
			id: "ledger",
			name: "Ledger",
			role: "numbers teammate: checks figures, counts and consistency; answers with what matches and what does not",
			room: "engineering",
			engine: "agy",
			model: "gemini-3.8-flash",
		},
	],
};

const ENGINE_LABELS: Record<OfficeEngine, string> = {
	claude: "Claude Code",
	codex: "Codex",
	agy: "Antigravity",
};

/**
 * The office that lives in this host: its state, one seat per AI teammate,
 * and the launch of each teammate's engine through the host's own CLI
 * resolver, so seats use the same logins and PATH as every other agent here.
 */
export class OfficeRuntime {
	readonly office: Office;
	readonly config: OfficeConfig;
	private readonly seats = new Map<string, Seat>();
	private readonly seatByToken = new Map<string, Seat>();
	private readonly tokens = new Map<string, string>();
	private readonly log: OfficeLogLine[] = [];
	private started = false;

	constructor(
		private readonly options: {
			db: HostDb;
			homeDir: string;
			baseUrl: () => string;
		},
	) {
		mkdirSync(options.homeDir, { recursive: true });
		this.config = this.loadConfig();
		this.office = new Office({
			statePath: join(options.homeDir, "state.json"),
			limits: this.config.limits,
		});
		this.applyConfig();
		this.office.subscribe((event) => {
			if (event.type !== "log") return;
			this.log.push({ seatId: event.seatId, text: event.text, ts: event.ts });
			if (this.log.length > LOG_LINES) this.log.shift();
		});
	}

	snapshot(): OfficeSnapshot {
		const state = this.office.snapshot();
		return {
			started: this.started,
			teammates: state.teammates.map(({ acpSessionId: _, ...t }) => t),
			rooms: state.rooms,
			messages: state.messages,
			handoffs: state.handoffs,
			log: [...this.log],
		};
	}

	seatForToken(token: string): Seat | undefined {
		return this.seatByToken.get(token);
	}

	handleMcp(token: string, request: Request): Promise<Response> {
		const seat = this.seatForToken(token);
		if (!seat)
			return Promise.resolve(new Response("Unknown seat", { status: 401 }));
		return handleMcpRequest(this.office, seat, request);
	}

	async start(): Promise<void> {
		if (this.started) return;
		this.started = true;
		for (const spec of this.config.seats) this.startSeat(spec);
	}

	async stop(): Promise<void> {
		this.started = false;
		await Promise.all(
			[...this.seats.values()].map((seat) => seat.stop().catch(() => {})),
		);
		this.seats.clear();
		this.seatByToken.clear();
	}

	say(input: {
		authorId: string;
		roomId: string;
		threadId?: string | null;
		text: string;
	}): { id: string } {
		const author = this.office.teammate(input.authorId);
		if (author?.kind !== "human") throw new Error("Only a person posts here");
		const { message } = this.office.post({
			authorId: input.authorId,
			roomId: input.roomId,
			threadId: input.threadId ?? null,
			text: input.text,
		});
		if (/^\s*stop\b/i.test(input.text) && message.threadId) {
			const canceled = this.office.cancelHandoffs(
				message.threadId,
				input.authorId,
			);
			for (const handoff of canceled)
				void this.seats.get(handoff.toId)?.cancel();
		}
		return { id: message.id };
	}

	setPaused(id: string, paused: boolean): void {
		this.office.setPaused(id, paused);
		if (paused) void this.seats.get(id)?.cancel();
	}

	hire(spec: OfficeSeatConfig): void {
		if (this.office.teammate(spec.id))
			throw new Error(`${spec.id} is already here`);
		this.config.seats.push(spec);
		for (const room of this.config.rooms) {
			if (room.id === spec.room && !room.members.includes(spec.id))
				room.members.push(spec.id);
		}
		this.saveConfig();
		this.applyConfig();
		if (this.started) this.startSeat(spec);
	}

	private startSeat(spec: OfficeSeatConfig): void {
		const teammate = this.office.teammate(spec.id);
		if (!teammate || this.seats.has(spec.id)) return;
		const token = randomBytes(16).toString("hex");
		this.tokens.set(spec.id, token);
		const seat = new Seat({
			teammate,
			office: this.office,
			homeDir: join(this.options.homeDir, "seats", spec.id),
			mcpUrl: `${this.options.baseUrl()}/office-mcp/${token}`,
			engineLabel: ENGINE_LABELS[spec.engine],
			fullAccessModeId: this.fullAccessModeId(spec.engine),
			launch: () => this.launch(spec),
		});
		this.seats.set(spec.id, seat);
		this.seatByToken.set(token, seat);
		seat.start().catch((error: Error) => {
			this.office.log(spec.id, `failed to start: ${error.message}`);
			this.office.setPresence(
				spec.id,
				"away",
				`failed to start: ${error.message.slice(0, 80)}`,
			);
		});
	}

	private fullAccessModeId(engine: OfficeEngine): string | undefined {
		if (engine === "claude")
			return ACP_HARNESSES["claude-acp"]?.fullAccessModeId;
		if (engine === "codex") return ACP_HARNESSES["codex-acp"]?.fullAccessModeId;
		return undefined;
	}

	private async launch(spec: OfficeSeatConfig): Promise<EngineLaunch> {
		const cwd = join(this.options.homeDir, "seats", spec.id);
		const env = () =>
			buildChatAgentEnv({ db: this.options.db, cwd, workspaceId: "office" });
		if (spec.engine === "agy") {
			const cli = await resolveAgentCli({
				binary: "agy",
				minVersion: UNGATED_VERSION,
				env,
			});
			return {
				command: cli.command,
				args: [
					"--dangerously-skip-permissions",
					...(spec.model ? ["--model", spec.model] : []),
					"acp",
				],
				env: cli.env,
			};
		}
		const entry =
			ACP_HARNESSES[spec.engine === "claude" ? "claude-acp" : "codex-acp"];
		if (!entry?.adapter || !entry.executableEnv)
			throw new Error(`${spec.engine} has no ACP adapter`);
		const cli = await resolveAgentCli({
			binary: entry.binary,
			minVersion: entry.minVersion,
			upgrade: entry.upgrade,
			env,
		});
		return {
			command: process.execPath,
			args: [adapterEntry(entry.adapter), ...entry.args],
			env: {
				...cli.env,
				ELECTRON_RUN_AS_NODE: "1",
				[entry.executableEnv]: cli.command,
				...(spec.engine === "claude" && spec.model
					? { ANTHROPIC_MODEL: spec.model }
					: {}),
			},
		};
	}

	private applyConfig(): void {
		for (const human of this.config.humans) {
			this.office.upsertTeammate({
				id: human.id,
				name: human.name,
				kind: "human",
				role: human.role,
				roomId: human.room,
			});
			this.office.setPresence(human.id, "in-office", "here");
		}
		for (const seat of this.config.seats) {
			this.office.upsertTeammate({
				id: seat.id,
				name: seat.name,
				kind: "ai",
				role: seat.role,
				roomId: seat.room,
				engine: seat.engine,
				model: seat.model,
				instructions: seat.instructions,
				dailyTurns: seat.dailyTurns,
			});
		}
		for (const room of this.config.rooms) {
			this.office.upsertRoom({
				id: room.id,
				name: room.name,
				kind: room.kind ?? "room",
				members: room.members,
			});
		}
	}

	private configPath(): string {
		return join(this.options.homeDir, "office.json");
	}

	private loadConfig(): OfficeConfig {
		const path = this.configPath();
		if (existsSync(path)) {
			return JSON.parse(readFileSync(path, "utf8")) as OfficeConfig;
		}
		const config = structuredClone(DEFAULT_OFFICE_CONFIG);
		writeFileSync(path, JSON.stringify(config, null, 2));
		return config;
	}

	private saveConfig(): void {
		writeFileSync(this.configPath(), JSON.stringify(this.config, null, 2));
	}
}
