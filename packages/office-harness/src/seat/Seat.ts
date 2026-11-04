import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	AcpRpcClient,
	type AcpServerRequest,
	spawnAcpTransport,
} from "@superset/chat-runtime/acp-client";
import type { Office } from "../office/Office";
import type { InboxItem, Teammate } from "../office/types";
import type { EngineLaunch } from "./engines";
import { inboxPrompt, normsDocument } from "./prompt";

const STARTUP_TIMEOUT_MS = 90_000;
const TURN_TIMEOUT_MS = 30 * 60_000;
const CANCEL_GRACE_MS = 15_000;

interface AcpUpdate {
	sessionUpdate: string;
	[key: string]: unknown;
}

interface ConfigOption {
	id: string;
	category?: string;
	currentValue?: unknown;
	options?: Array<{ value: string; name?: string }>;
}

export interface TurnContext {
	depth: number;
	asks: number;
	replyTo: string;
}

export interface SeatOptions {
	teammate: Teammate;
	office: Office;
	homeDir: string;
	mcpUrl: string;
	/** How to start this teammate's engine; the office decides, the seat only runs it. */
	launch: () => Promise<EngineLaunch>;
	engineLabel: string;
	fullAccessModeId?: string;
}

/**
 * One AI teammate's seat: a long-lived engine session (Claude Code, Codex or
 * agy over ACP) with an inbox. Items queue while a turn runs; the next turn
 * delivers them together. Presence and the status line come from the ACP
 * stream unless the teammate sets its own line.
 */
export class Seat {
	readonly id: string;
	private client: AcpRpcClient | null = null;
	private sessionId: string | null = null;
	private protocolVersion = 1;
	private readonly inbox: InboxItem[] = [];
	private running = false;
	private stopped = false;
	private exit: string | null = null;
	private lastText = "";
	private turn: TurnContext | null = null;
	private statusSetThisTurn = false;
	private saidThisTurn = false;
	private pump: Promise<void> | null = null;

	constructor(private readonly options: SeatOptions) {
		this.id = options.teammate.id;
		options.office.onInbox(this.id, (item) => this.receive(item));
	}

	get currentTurn(): TurnContext | null {
		return this.turn;
	}

	get teammate(): Teammate {
		return this.options.office.teammate(this.id) ?? this.options.teammate;
	}

	noteSaid(): void {
		this.saidThisTurn = true;
	}

	noteStatus(): void {
		this.statusSetThisTurn = true;
	}

	async start(): Promise<void> {
		const { office, homeDir, teammate } = this.options;
		mkdirSync(homeDir, { recursive: true });
		const norms = normsDocument(office, teammate);
		writeFileSync(join(homeDir, "CLAUDE.md"), norms);
		writeFileSync(join(homeDir, "AGENTS.md"), norms);
		writeFileSync(join(homeDir, "GEMINI.md"), norms);

		const launch = await this.options.launch();
		this.log(
			`starting ${this.options.engineLabel} (${launch.command} ${launch.args.join(" ")})`,
		);
		this.client = new AcpRpcClient({
			createTransport: (handlers) =>
				spawnAcpTransport(
					{
						command: launch.command,
						args: launch.args,
						cwd: homeDir,
						env: launch.env,
					},
					handlers,
				),
			onNotification: ({ method, params }) => {
				if (method !== "session/update") return;
				const { sessionId, update } = params as {
					sessionId?: string;
					update?: AcpUpdate;
				};
				if (sessionId && this.sessionId && sessionId !== this.sessionId) return;
				if (update) this.observe(update);
			},
			onServerRequest: (request) => this.answer(request),
			onStderr: (chunk) => {
				const text = chunk.trim();
				if (text) this.log(`stderr: ${text.slice(0, 400)}`);
			},
			onExit: (code, signal) => {
				this.exit = `engine exited (code ${code ?? "none"}, signal ${signal ?? "none"})`;
				this.log(this.exit);
				office.setPresence(this.id, "away", "engine exited");
			},
		});

		const init = (await this.client.request(
			"initialize",
			{
				protocolVersion: 2,
				info: { name: "paradev-office", version: "0.0.1" },
				capabilities: {},
				clientCapabilities: {
					fs: { readTextFile: false, writeTextFile: false },
					terminal: false,
				},
			},
			STARTUP_TIMEOUT_MS,
		)) as { protocolVersion?: number };
		this.protocolVersion = init.protocolVersion ?? 1;

		const mcpServers = [
			{ type: "http", name: "office", url: this.options.mcpUrl, headers: [] },
		];
		type Created = {
			sessionId?: string;
			configOptions?: ConfigOption[];
		} | null;
		let created: Created = null;
		const previous = this.teammate.acpSessionId;
		if (previous) {
			try {
				const method =
					this.protocolVersion >= 2 ? "session/resume" : "session/load";
				created = (await this.client.request(
					method,
					{ sessionId: previous, cwd: homeDir, mcpServers },
					STARTUP_TIMEOUT_MS,
				)) as Created;
				this.sessionId = previous;
				this.log(`resumed session ${previous}`);
			} catch (error) {
				this.log(
					`could not resume ${previous}: ${(error as Error).message}; starting fresh`,
				);
			}
		}
		if (!this.sessionId) {
			created = (await this.client.request(
				"session/new",
				{ cwd: homeDir, mcpServers },
				STARTUP_TIMEOUT_MS,
			)) as Created;
			this.sessionId = created?.sessionId ?? null;
			if (!this.sessionId) throw new Error("session/new returned no sessionId");
			office.rememberSession(this.id, this.sessionId);
			this.log(`new session ${this.sessionId}`);
		}
		await this.configure(
			this.options.fullAccessModeId,
			created?.configOptions ?? [],
		);
		office.setPresence(this.id, "in-office", "ready");
		this.schedule();
	}

	async stop(): Promise<void> {
		this.stopped = true;
		await this.cancel();
		await this.client?.close();
		this.options.office.setPresence(this.id, "away", "");
	}

	async cancel(): Promise<void> {
		if (!this.client || !this.sessionId || !this.running) return;
		this.client.notify("session/cancel", { sessionId: this.sessionId });
		const deadline = Date.now() + CANCEL_GRACE_MS;
		while (this.running && !this.exit && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}

	private receive(item: InboxItem): void {
		this.inbox.push(item);
		this.log(
			`inbox +1 (${item.reason}, depth ${item.depth}): ${item.message.text.slice(0, 80)}`,
		);
		this.schedule();
	}

	private schedule(): void {
		if (this.pump || this.stopped || !this.sessionId) return;
		this.pump = this.drain().finally(() => {
			this.pump = null;
			if (this.inbox.length > 0) this.schedule();
		});
	}

	private async drain(): Promise<void> {
		while (this.inbox.length > 0 && !this.stopped && !this.exit) {
			const items = this.inbox.splice(0, this.inbox.length);
			await this.runTurn(items);
		}
	}

	private async runTurn(items: InboxItem[]): Promise<void> {
		const { office } = this.options;
		if (!this.client || !this.sessionId) return;
		if (!office.spendTurn(this.id)) {
			this.log("no budget left today; inbox items dropped");
			const first = items[0];
			if (first)
				office.post({
					authorId: this.id,
					roomId: first.message.roomId,
					threadId: first.message.threadId ?? first.message.id,
					text: `(held) ${this.teammate.name} has no attention budget left today.`,
					kind: "system",
				});
			return;
		}
		const first = items[0];
		if (!first) return;
		const replyTo = first.message.threadId
			? `room:${first.message.roomId}/thread:${first.message.threadId}`
			: `room:${first.message.roomId}/thread:${first.message.id}`;
		this.turn = {
			depth: Math.max(...items.map((i) => i.depth)),
			asks: 0,
			replyTo,
		};
		this.statusSetThisTurn = false;
		this.saidThisTurn = false;
		this.lastText = "";
		this.running = true;
		office.setPresence(this.id, "focused", "reading the inbox");
		this.log(`turn start: ${items.length} item(s)`);
		try {
			const response = (await this.client.request(
				"session/prompt",
				{
					sessionId: this.sessionId,
					prompt: [{ type: "text", text: inboxPrompt(office, items) }],
				},
				TURN_TIMEOUT_MS,
			)) as { stopReason?: string } | null;
			this.log(`turn end: ${response?.stopReason ?? "no stop reason"}`);
			if (!this.saidThisTurn && this.lastText.trim()) {
				const parsed = /^room:([^/\s]+)\/thread:([^/\s]+)$/.exec(replyTo);
				if (parsed)
					office.post({
						authorId: this.id,
						roomId: parsed[1] ?? "",
						threadId: parsed[2],
						text: this.lastText.trim(),
						depth: this.turn.depth,
					});
			}
		} catch (error) {
			this.log(`turn failed: ${(error as Error).message}`);
		} finally {
			this.running = false;
			this.turn = null;
			const waiting = office.openHandoffsFrom(this.id);
			const line =
				waiting.length > 0
					? `waiting on ${waiting.map((h) => office.teammate(h.toId)?.name ?? h.toId).join(", ")}`
					: "ready";
			office.setPresence(
				this.id,
				waiting.length > 0 ? "in-meeting" : "in-office",
				line,
			);
		}
	}

	private async configure(
		fullAccessModeId: string | undefined,
		options: ConfigOption[],
	): Promise<void> {
		if (!this.client || !this.sessionId) return;
		const set = async (configId: string, value: string) => {
			await this.client?.request(
				"session/set_config_option",
				{ sessionId: this.sessionId, configId, type: "id", value },
				STARTUP_TIMEOUT_MS,
			);
		};
		if (fullAccessModeId) {
			const mode = options.find((o) => o.category === "mode");
			try {
				if (this.protocolVersion >= 2 && mode)
					await set(mode.id, fullAccessModeId);
				else
					await this.client.request(
						"session/set_mode",
						{ sessionId: this.sessionId, modeId: fullAccessModeId },
						STARTUP_TIMEOUT_MS,
					);
			} catch (error) {
				this.log(
					`could not set mode ${fullAccessModeId}: ${(error as Error).message}`,
				);
			}
		}
		const model = this.teammate.model;
		const modelOption = options.find((o) => o.category === "model");
		if (model && modelOption) {
			const known = modelOption.options?.some((o) => o.value === model) ?? true;
			if (known)
				await set(modelOption.id, model).catch((error: Error) =>
					this.log(`could not set model ${model}: ${error.message}`),
				);
			else
				this.log(
					`model ${model} not offered; offered: ${modelOption.options?.map((o) => o.value).join(", ")}`,
				);
		}
	}

	private observe(update: AcpUpdate): void {
		const { office } = this.options;
		if (
			update.sessionUpdate === "tool_call" &&
			typeof update.title === "string"
		) {
			if (!this.statusSetThisTurn)
				office.setLine(this.id, update.title.slice(0, 120));
		} else if (update.sessionUpdate === "agent_message_chunk") {
			const content = update.content as
				| { type?: string; text?: string }
				| undefined;
			if (content?.type === "text" && content.text)
				this.lastText += content.text;
		} else if (update.sessionUpdate === "user_message_chunk") {
			this.lastText = "";
		} else if (update.sessionUpdate === "state_update") {
			if (update.state === "running") this.running = true;
		}
	}

	private answer(request: AcpServerRequest): void {
		if (!this.client) return;
		if (request.method === "session/request_permission") {
			const options =
				(
					request.params as {
						options?: Array<{ optionId: string; kind?: string }>;
					}
				).options ?? [];
			const allow =
				options.find((o) => o.kind === "allow_once") ??
				options.find((o) => o.kind?.startsWith("allow")) ??
				options[0];
			this.client.respond(request.id, {
				outcome: allow
					? { outcome: "selected", optionId: allow.optionId }
					: { outcome: "cancelled" },
			});
			return;
		}
		if (request.method === "elicitation/create") {
			this.client.respond(request.id, { action: "decline" });
			return;
		}
		this.client.respondWithError(
			request.id,
			-32601,
			`${request.method} is not supported by the office`,
		);
	}

	private log(text: string): void {
		this.options.office.log(this.id, text);
	}
}
