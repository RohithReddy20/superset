import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	adapterEntry,
	type EngineLaunch,
	handleMcpRequest,
	Office,
	replyTarget,
	Seat,
	type Task,
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
	OfficeTaskStatus,
} from "./types";

const LOG_LINES = 200;
const CHECK_TIMEOUT_MS = 10 * 60_000;
const CHECK_OUTPUT_TAIL = 4000;
const run = promisify(execFile);

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
			leadId: this.config.lead,
			maxTaskRounds: this.config.limits?.taskRounds,
		});
		this.applyConfig();
		this.office.subscribe((event) => {
			if (event.type === "log") {
				this.log.push({ seatId: event.seatId, text: event.text, ts: event.ts });
				if (this.log.length > LOG_LINES) this.log.shift();
			} else if (event.type === "task") this.onTask(event.task, event.change);
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
			tasks: state.tasks,
			log: [...this.log],
			project: this.config.project
				? {
						repoPath: this.config.project.repoPath,
						testCommand: this.config.project.testCommand,
					}
				: null,
			leadId: this.config.lead ?? null,
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
			[...this.seats.values(), ...this.taskSessions.values()].map((seat) =>
				seat.stop().catch(() => {}),
			),
		);
		this.taskSessions.clear();
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
		this.joinRoom(input.authorId, input.roomId);
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

	createTask(input: {
		by: string;
		title: string;
		brief: string;
		roomId: string;
		ownerId?: string | null;
		verifierId?: string | null;
	}): { id: string } {
		this.requirePerson(input.by);
		const task = this.office.createTask(input);
		return { id: task.id };
	}

	assignTask(input: { by: string; id: string; ownerId: string }): void {
		this.requirePerson(input.by);
		this.office.assignTask(input.id, input.ownerId, input.by);
	}

	updateTask(input: {
		by: string;
		id: string;
		status: OfficeTaskStatus;
		note: string;
	}): void {
		this.requirePerson(input.by);
		this.office.updateTask(
			input.id,
			{ status: input.status, note: input.note },
			input.by,
		);
	}

	private requirePerson(id: string): void {
		if (this.office.teammate(id)?.kind !== "human")
			throw new Error("Only a person does this from the app");
	}

	/* ---------- tasks: a worktree, a work session, checks, a review session ---------- */

	private readonly taskSessions = new Map<string, Seat>();
	private readonly taskBase = new Map<string, string>();

	private onTask(
		task: Task,
		change: "created" | "assigned" | "status" | "usage",
	): void {
		if (change === "assigned" && task.ownerId) {
			if (this.office.teammate(task.ownerId)?.kind === "ai")
				void this.startWork(task.id);
			return;
		}
		if (change !== "status") return;
		const lastBy = task.notes.at(-1)?.by;
		if (task.status === "review" && lastBy === task.ownerId)
			void this.verify(task.id);
		else if (
			task.status === "doing" &&
			lastBy !== task.ownerId &&
			task.ownerId &&
			this.office.teammate(task.ownerId)?.kind === "ai"
		)
			void this.startWork(task.id);
	}

	private seatSpec(id: string): OfficeSeatConfig | undefined {
		return this.config.seats.find((s) => s.id === id);
	}

	private async workspaceFor(task: Task): Promise<string | null> {
		const project = this.config.project;
		if (!project) return null;
		if (task.workspacePath && existsSync(task.workspacePath))
			return task.workspacePath;
		const path = join(this.options.homeDir, "..", "office-work", task.id);
		const branch = `office/${task.id.toLowerCase()}`;
		const base =
			project.baseBranch ??
			(
				await run("git", [
					"-C",
					project.repoPath,
					"rev-parse",
					"--abbrev-ref",
					"HEAD",
				])
			).stdout.trim();
		this.taskBase.set(task.id, base);
		mkdirSync(join(path, ".."), { recursive: true });
		const exists = (
			await run("git", ["-C", project.repoPath, "branch", "--list", branch])
		).stdout.trim();
		await run("git", [
			"-C",
			project.repoPath,
			"worktree",
			"add",
			...(exists ? [path, branch] : ["-b", branch, path, base]),
		]);
		this.office.setTaskWorkspace(task.id, { path, branch });
		this.office.log(
			task.ownerId ?? "office",
			`${task.id}: worktree ${path} on ${branch} from ${base}`,
		);
		return path;
	}

	private async taskSeat(
		teammateId: string,
		cwd: string | null,
		label: string,
	): Promise<Seat> {
		const spec = this.seatSpec(teammateId);
		const teammate = this.office.teammate(teammateId);
		if (!spec || !teammate) throw new Error(`${teammateId} has no seat`);
		const token = randomBytes(16).toString("hex");
		const homeDir = join(this.options.homeDir, "..", "office-seats", spec.id);
		const seat = new Seat({
			teammate,
			office: this.office,
			homeDir,
			cwd: cwd ?? homeDir,
			label,
			mcpUrl: `${this.options.baseUrl()}/office-mcp/${token}`,
			engineLabel: ENGINE_LABELS[spec.engine],
			fullAccessModeId: this.fullAccessModeId(spec.engine),
			launch: () => this.launch(spec, cwd ?? homeDir),
		});
		this.seatByToken.set(token, seat);
		await seat.start();
		return seat;
	}

	private releaseTaskSeat(seat: Seat): void {
		for (const [token, s] of this.seatByToken)
			if (s === seat) this.seatByToken.delete(token);
		void seat.stop().catch(() => {});
	}

	private force(task: Task, status: OfficeTaskStatus, note: string): void {
		this.office.updateTask(task.id, { status, note }, task.createdById, {
			force: true,
		});
	}

	private async startWork(taskId: string): Promise<void> {
		const task = this.office.task(taskId);
		if (!task?.ownerId || this.taskSessions.has(taskId)) return;
		const owner = this.office.teammate(task.ownerId);
		if (!owner || owner.paused) return;
		if (!this.office.spendTaskRound(taskId)) {
			this.force(
				task,
				"blocked",
				`used all ${task.rounds.max} rounds; a person decides what happens next`,
			);
			return;
		}
		let seat: Seat | null = null;
		try {
			const cwd = await this.workspaceFor(task);
			seat = await this.taskSeat(owner.id, cwd, `work on ${task.id}`);
			this.taskSessions.set(taskId, seat);
			this.office.setPresence(owner.id, "focused", `working on ${task.id}`);
			const text = await seat.run(
				this.workPrompt(this.office.task(taskId) ?? task, cwd),
				{
					depth: 0,
					asks: 0,
					replyTo: replyTarget(task.roomId, task.threadId),
					taskId,
				},
			);
			const after = this.office.task(taskId);
			if (after && (after.status === "todo" || after.status === "doing"))
				this.office.updateTask(
					taskId,
					{ status: "review", note: text || "finished without a report" },
					owner.id,
				);
		} catch (error) {
			const current = this.office.task(taskId);
			if (current)
				this.force(
					current,
					"blocked",
					`work session failed: ${(error as Error).message}`,
				);
		} finally {
			this.taskSessions.delete(taskId);
			if (seat) this.releaseTaskSeat(seat);
			this.office.setPresence(owner.id, "in-office", "ready");
		}
	}

	private async verify(taskId: string): Promise<void> {
		const task = this.office.task(taskId);
		if (!task) return;
		const project = this.config.project;
		if (project?.testCommand && task.workspacePath) {
			const check = await this.runCheck(
				project.testCommand,
				task.workspacePath,
			);
			this.office.recordTaskCheck(taskId, check);
			this.office.post({
				authorId: task.createdById,
				roomId: task.roomId,
				threadId: task.threadId,
				text: `${task.id} checks ${check.ok ? "passed" : "failed"}: ${check.command}${
					check.ok
						? ""
						: `
${check.output.slice(-600)}`
				}`,
				kind: "system",
			});
			if (!check.ok) {
				this.force(task, "doing", "checks failed; fix them and report again");
				return;
			}
		}
		const verifierId =
			task.verifierId ??
			this.config.verifier ??
			this.config.seats.find(
				(s) => s.id !== task.ownerId && !this.office.teammate(s.id)?.paused,
			)?.id ??
			null;
		if (!verifierId || verifierId === task.ownerId) return;
		this.office.setTaskVerifier(taskId, verifierId);
		if (!this.office.spendTaskRound(taskId)) {
			this.force(
				task,
				"blocked",
				`used all ${task.rounds.max} rounds before a review; a person decides`,
			);
			return;
		}
		let seat: Seat | null = null;
		try {
			seat = await this.taskSeat(
				verifierId,
				task.workspacePath ?? null,
				`review ${task.id}`,
			);
			this.office.setPresence(verifierId, "focused", `reviewing ${task.id}`);
			const text = await seat.run(
				this.reviewPrompt(this.office.task(taskId) ?? task),
				{
					depth: 0,
					asks: 0,
					replyTo: replyTarget(task.roomId, task.threadId),
					taskId,
				},
			);
			const after = this.office.task(taskId);
			if (after?.status === "review" && text)
				this.office.post({
					authorId: verifierId,
					roomId: task.roomId,
					threadId: task.threadId,
					text: `(review, no verdict given) ${text.slice(0, 1500)}`,
					kind: "system",
				});
		} catch (error) {
			this.office.log(
				verifierId,
				`review of ${task.id} failed: ${(error as Error).message}`,
			);
		} finally {
			if (seat) this.releaseTaskSeat(seat);
			this.office.setPresence(verifierId, "in-office", "ready");
		}
	}

	private async runCheck(command: string, cwd: string) {
		const at = Date.now();
		try {
			const { stdout, stderr } = await run("sh", ["-lc", command], {
				cwd,
				timeout: CHECK_TIMEOUT_MS,
				maxBuffer: 16 * 1024 * 1024,
			});
			return {
				command,
				ok: true,
				output: `${stdout}\n${stderr}`.slice(-CHECK_OUTPUT_TAIL),
				at,
			};
		} catch (error) {
			const e = error as { stdout?: string; stderr?: string; message: string };
			return {
				command,
				ok: false,
				output: `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message}`.slice(
					-CHECK_OUTPUT_TAIL,
				),
				at,
			};
		}
	}

	private workPrompt(task: Task, cwd: string | null): string {
		const project = this.config.project;
		const notes = task.notes
			.map(
				(n) =>
					`- ${this.office.teammate(n.by)?.name ?? n.by} (${n.status}): ${n.text}`,
			)
			.join("\n");
		return [
			`[Task ${task.id}] ${task.title}`,
			``,
			`Brief: ${task.brief}`,
			``,
			cwd && project
				? `You own this task. You are in a git checkout at ${cwd}, on branch ${task.branch}, a worktree of ${project.repoPath}. Work here only.`
				: `You own this task. There is no project checkout; do what the brief asks with what you have.`,
			`Rules:`,
			`1. Call update_task("${task.id}", "doing", one line) before you start.`,
			cwd
				? `2. Make the change and commit it on this branch with a clear message. Do not push and do not switch branches.`
				: `2. Do the work.`,
			project?.testCommand && cwd
				? `3. Run the tests before you report: ${project.testCommand}`
				: `3. Check your own work before you report.`,
			`4. When finished call update_task("${task.id}", "review", what changed and how you tested it). If you cannot finish, update_task("${task.id}", "blocked", what you need).`,
			`5. A question for the person goes to say(reply_to: "${replyTarget(task.roomId, task.threadId)}", ...). Do not pull other teammates in.`,
			notes ? `\nNotes so far:\n${notes}` : ``,
		].join("\n");
	}

	private reviewPrompt(task: Task): string {
		const base =
			this.taskBase.get(task.id) ?? this.config.project?.baseBranch ?? "HEAD~1";
		const owner = this.office.teammate(task.ownerId ?? "")?.name ?? "the owner";
		const report =
			task.notes.filter((n) => n.by === task.ownerId).at(-1)?.text ??
			"(no report)";
		return [
			`[Review ${task.id}] ${task.title}`,
			``,
			`Brief: ${task.brief}`,
			``,
			`You are the verifier. ${owner} reports: ${report}`,
			task.check
				? `Automated checks ${task.check.ok ? "passed" : "failed"} (${task.check.command}).`
				: ``,
			task.workspacePath
				? `You are in the task's checkout at ${task.workspacePath} on branch ${task.branch}. Read the change with: git log --oneline ${base}..HEAD and git diff ${base}...HEAD. Run the tests yourself if there are any.`
				: `There is no checkout; judge the report against the brief.`,
			`Judge only against the brief. Do not edit files.`,
			`Then call update_task("${task.id}", "verified", a short verdict) or update_task("${task.id}", "doing", exactly what must change).`,
		].join("\n");
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

	addRoom(room: { id: string; name: string; place?: string }): void {
		if (this.config.rooms.some((r) => r.id === room.id))
			throw new Error(`room ${room.id} already exists`);
		this.config.rooms.push({ ...room, kind: "room", members: [] });
		this.saveConfig();
		this.applyConfig();
	}

	/**
	 * The private chat between a person and a set of AI teammates, made on first use. One message
	 * there reaches every member, wherever they sit.
	 */
	openGroup(personId: string, memberIds: string[]): { roomId: string } {
		if (this.office.teammate(personId)?.kind !== "human")
			throw new Error("Only a person opens a group chat");
		const ids = [...new Set(memberIds)]
			.filter((id) => this.office.teammate(id)?.kind === "ai")
			.sort();
		if (ids.length === 0) throw new Error("Pick at least one AI teammate");
		const roomId = `group-${ids.join("+")}`;
		const members = [personId, ...ids];
		const existing = this.config.rooms.find((r) => r.id === roomId);
		if (existing && members.every((m) => existing.members.includes(m)))
			return { roomId };
		if (existing) existing.members = members;
		else
			this.config.rooms.push({
				id: roomId,
				name: ids.map((id) => this.office.teammate(id)?.name ?? id).join(", "),
				kind: "dm",
				members,
			});
		this.saveConfig();
		this.applyConfig();
		return { roomId };
	}

	/** A person may post in any room; posting makes them a member, their home room stays. */
	private joinRoom(personId: string, roomId: string): void {
		const room = this.config.rooms.find((r) => r.id === roomId);
		if (!room || room.kind === "dm" || room.members.includes(personId)) return;
		room.members.push(personId);
		this.saveConfig();
		this.applyConfig();
	}

	/** Changes the teammate's home room; it stays a member of every room it was in. */
	moveTeammate(id: string, roomId: string): void {
		const room = this.config.rooms.find((r) => r.id === roomId);
		if (!room || room.kind === "dm") throw new Error(`no room ${roomId}`);
		const spec = this.homeSpec(id);
		if (!spec) throw new Error(`no teammate ${id}`);
		spec.room = roomId;
		if (!room.members.includes(id)) room.members.push(id);
		this.saveConfig();
		this.applyConfig();
	}

	/** Deletes the room, its messages and hand-offs; whoever lived there moves to another room. */
	deleteRoom(roomId: string): void {
		const moves = this.office.removeRoom(roomId);
		for (const move of moves) {
			const spec = this.homeSpec(move.teammateId);
			if (spec) spec.room = move.roomId;
			const room = this.config.rooms.find((r) => r.id === move.roomId);
			if (room && !room.members.includes(move.teammateId))
				room.members.push(move.teammateId);
		}
		const index = this.config.rooms.findIndex((r) => r.id === roomId);
		if (index >= 0) this.config.rooms.splice(index, 1);
		this.saveConfig();
		this.applyConfig();
	}

	setDesks(
		desks: Array<{ id: string; zoneId: string; x: number; y: number }>,
	): void {
		for (const { id, ...desk } of desks) this.office.setDesk(id, desk);
	}

	private homeSpec(id: string): { room: string } | undefined {
		return (
			this.config.seats.find((s) => s.id === id) ??
			this.config.humans.find((h) => h.id === id)
		);
	}

	private startSeat(spec: OfficeSeatConfig): void {
		const teammate = this.office.teammate(spec.id);
		if (!teammate || this.seats.has(spec.id)) return;
		const token = randomBytes(16).toString("hex");
		this.tokens.set(spec.id, token);
		const seat = new Seat({
			teammate,
			office: this.office,
			homeDir: join(this.options.homeDir, "..", "office-seats", spec.id),
			mcpUrl: `${this.options.baseUrl()}/office-mcp/${token}`,
			engineLabel: ENGINE_LABELS[spec.engine],
			fullAccessModeId: this.fullAccessModeId(spec.engine),
			launch: () =>
				this.launch(
					spec,
					join(this.options.homeDir, "..", "office-seats", spec.id),
				),
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

	private async launch(
		spec: OfficeSeatConfig,
		cwd: string,
	): Promise<EngineLaunch> {
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
				place: room.place,
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
