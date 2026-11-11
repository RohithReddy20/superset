import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** A running agent the city knows by name. */
export interface TaskAgent {
	terminalId: string;
	workspaceId: string;
	projectId: string;
	agentId: string;
	name: string;
}

export type CityTaskStatus =
	| "working"
	| "checking"
	| "reviewing"
	| "ready"
	| "pr"
	| "blocked"
	| "done"
	| "cancelled";

export interface CityTaskEvent {
	at: number;
	text: string;
}

/**
 * Work a person gave one agent in its own workspace. The agent says when it is done; a check command
 * and a second agent check it before it reaches the person, who closes it or asks for a pull request.
 */
export interface CityTask {
	id: string;
	title: string;
	brief: string;
	terminalId: string;
	workspaceId: string;
	projectId: string;
	agentName: string;
	/** Shell command run in the workspace before the checker reads the change. */
	checkCommand?: string;
	/** The agent kind that checks the work, "claude" or "codex"; unset skips that step. */
	checker?: string;
	checkerTerminalId?: string;
	checkerName?: string;
	/** The commit the work started from, so the checker reads only this task's change. */
	baseRef?: string;
	status: CityTaskStatus;
	round: number;
	report?: string;
	check?: { command: string; ok: boolean; output: string; at: number };
	verdict?: { ok: boolean; text: string; at: number };
	blockedReason?: string;
	prUrl?: string;
	/** Why the agent could not open a pull request the last time it was asked. */
	prError?: string;
	events: CityTaskEvent[];
	createdAt: number;
	updatedAt: number;
}

export interface CityTasksSnapshot {
	tasks: CityTask[];
	/** The last check command used in each project, to offer it again. */
	checkCommands: Record<string, string>;
}

export interface CityTasksDeps {
	statePath: string;
	agents: () => TaskAgent[];
	workspace: (
		workspaceId: string,
	) => { path: string; branch?: string | null; name: string } | null;
	send: (agent: TaskAgent, text: string) => Promise<void>;
	lastReply: (agent: TaskAgent) => Promise<string | null>;
	/** Starts the checker in the worker's workspace, under a city name. */
	startChecker: (
		workspaceId: string,
		agent: string,
		prompt: string,
	) => Promise<{ terminalId: string; name: string }>;
	stopAgent: (terminalId: string, workspaceId: string) => Promise<void>;
	runCheck: (
		command: string,
		cwd: string,
	) => Promise<{ ok: boolean; output: string }>;
	/** The commit checked out in a folder, or null outside git. */
	headOf: (cwd: string) => Promise<string | null>;
	/** The terminal an agent continued in after its terminal stopped, if any. */
	successorOf?: (terminalId: string, workspaceId: string) => string | undefined;
	now?: () => number;
	/** Wait after a turn ends before reading its answer, so the agent has written it down. */
	settleMs?: number;
	/** Wait after an agent comes back in a new terminal before typing to it, so its screen is ready. */
	bootMs?: number;
	/** Called after the saved state changed. */
	onChange?: () => void;
}

const KEPT_FINISHED = 50;
const CHECK_TAIL = 1500;
const VERDICT_TAIL = 4000;
const OPEN: CityTaskStatus[] = [
	"working",
	"checking",
	"reviewing",
	"ready",
	"pr",
	"blocked",
];

interface State {
	next: number;
	tasks: CityTask[];
	checkCommands: Record<string, string>;
}

export class CityTasks {
	private state: State;
	private readonly now: () => number;
	private readonly lastSeen = new Map<string, string>();
	private readonly busy = new Set<string>();
	/** Tasks whose agent stopped mid-way and continues in a new terminal: told to carry on once it is up. */
	private readonly interrupted = new Set<string>();

	constructor(private readonly deps: CityTasksDeps) {
		this.now = deps.now ?? Date.now;
		this.state = load(deps.statePath);
	}

	snapshot(): CityTasksSnapshot {
		this.follow();
		return {
			tasks: [...this.state.tasks].sort((a, b) => b.createdAt - a.createdAt),
			checkCommands: this.state.checkCommands,
		};
	}

	async give(input: {
		terminalId: string;
		title: string;
		brief: string;
		checkCommand?: string;
		checker?: string;
	}): Promise<CityTask> {
		const agent = this.agent(input.terminalId);
		if (!agent) throw new Error("That agent is no longer running");
		if (this.openTaskOf(agent.terminalId))
			throw new Error("That agent already has a task; close it first");
		const title = input.title.trim();
		if (!title) throw new Error("A task needs a title");
		const workspace = this.deps.workspace(agent.workspaceId);
		if (!workspace) throw new Error("Its workspace is gone");
		const checkCommand = input.checkCommand?.trim() || undefined;
		const at = this.now();
		const task: CityTask = {
			id: `C-${this.state.next}`,
			title,
			brief: input.brief.trim(),
			terminalId: agent.terminalId,
			workspaceId: agent.workspaceId,
			projectId: agent.projectId,
			agentName: agent.name,
			...(checkCommand ? { checkCommand } : {}),
			...(input.checker ? { checker: input.checker } : {}),
			baseRef: (await this.deps.headOf(workspace.path)) ?? undefined,
			status: "working",
			round: 1,
			events: [{ at, text: `Given to ${agent.name}` }],
			createdAt: at,
			updatedAt: at,
		};
		await this.reach(agent, this.brief(task, workspace));
		this.state.next += 1;
		if (checkCommand) this.state.checkCommands[agent.projectId] = checkCommand;
		this.state.tasks.push(task);
		this.save();
		return task;
	}

	async sendBack(id: string, note: string): Promise<CityTask> {
		const task = this.task(id);
		if (task.status !== "ready" && task.status !== "blocked")
			throw new Error("Only a task waiting for you can be sent back");
		const agent = this.agent(task.terminalId);
		if (!agent) throw new Error("Its agent is no longer running");
		await this.reach(
			agent,
			[
				`[Paradev task ${task.id}] The person sent "${task.title}" back to you.`,
				note.trim(),
				doneLine(),
			]
				.filter(Boolean)
				.join("\n\n"),
		);
		task.round += 1;
		task.status = "working";
		this.event(task, `Sent back: ${note.trim() || "try again"}`);
		return task;
	}

	async askForPullRequest(id: string): Promise<CityTask> {
		const task = this.task(id);
		if (task.status !== "ready")
			throw new Error("Only a checked task can become a pull request");
		const agent = this.agent(task.terminalId);
		if (!agent) throw new Error("Its agent is no longer running");
		await this.reach(
			agent,
			[
				`[Paradev task ${task.id}] The person approved "${task.title}".`,
				`Push your branch and open a pull request for it (for example with gh pr create), titled "${task.title}", saying what changed and how it was checked.`,
				"End your reply with one line: PR: <the pull request's URL>",
				"If you cannot open one, end with one line: PR FAILED: <why>",
			].join("\n"),
		);
		task.status = "pr";
		this.event(task, "You asked for a pull request");
		return task;
	}

	close(id: string): CityTask {
		const task = this.task(id);
		if (!OPEN.includes(task.status))
			throw new Error("That task is already finished");
		task.status = "done";
		this.event(task, "You closed it");
		return task;
	}

	async cancel(id: string): Promise<CityTask> {
		const task = this.task(id);
		if (!OPEN.includes(task.status))
			throw new Error("That task is already finished");
		task.status = "cancelled";
		this.event(task, "You cancelled it");
		await this.stopChecker(task);
		return task;
	}

	/** Cancels the open task of an agent that was removed for good. */
	dropAgent(terminalId: string): void {
		const task = this.openTaskOf(terminalId);
		if (!task) return;
		task.status = "cancelled";
		this.event(task, `${task.agentName} was removed`);
	}

	/** On a finished turn, moves the task of the worker or the checker that just stopped. */
	async onAgentEvent(event: {
		terminalId: string;
		eventType: string;
	}): Promise<void> {
		this.follow();
		const resumed = this.state.tasks.find(
			(t) => t.terminalId === event.terminalId && this.interrupted.has(t.id),
		);
		if (resumed) await this.carryOn(resumed);
		if (event.eventType !== "Stop") return;
		const asWorker = this.state.tasks.find(
			(t) =>
				t.terminalId === event.terminalId &&
				(t.status === "working" || t.status === "pr"),
		);
		const asChecker = this.state.tasks.find(
			(t) =>
				t.checkerTerminalId === event.terminalId && t.status === "reviewing",
		);
		const task = asWorker ?? asChecker;
		if (!task || this.busy.has(task.id)) return;
		const agent = this.agent(event.terminalId);
		if (!agent) return;
		this.busy.add(task.id);
		try {
			const settle = this.deps.settleMs ?? 1000;
			if (settle > 0) await new Promise((r) => setTimeout(r, settle));
			const reply = (await this.deps.lastReply(agent))?.trim();
			if (!reply || this.lastSeen.get(agent.terminalId) === reply) return;
			this.lastSeen.set(agent.terminalId, reply);
			if (asChecker) await this.onVerdict(task, reply);
			else if (task.status === "pr") this.onPullRequest(task, reply);
			else await this.onWorkerReply(task, agent, reply);
		} finally {
			this.busy.delete(task.id);
		}
	}

	private async onWorkerReply(
		task: CityTask,
		agent: TaskAgent,
		reply: string,
	): Promise<void> {
		const blocked = marker(reply, "TASK BLOCKED");
		if (blocked) {
			this.block(task, blocked);
			return;
		}
		const done = marker(reply, "TASK DONE");
		if (!done) return;
		task.report = done;
		this.event(task, `${task.agentName} says it is done: ${done}`);
		const workspace = this.deps.workspace(task.workspaceId);
		if (task.checkCommand && workspace) {
			task.status = "checking";
			this.save();
			const at = this.now();
			const result = await this.deps.runCheck(
				task.checkCommand,
				workspace.path,
			);
			task.check = {
				command: task.checkCommand,
				ok: result.ok,
				output: result.output.slice(-CHECK_TAIL),
				at,
			};
			if (!result.ok) {
				this.event(task, `\`${task.checkCommand}\` failed`);
				await this.retry(
					task,
					agent,
					`The check \`${task.checkCommand}\` failed:\n${task.check.output}`,
				);
				return;
			}
			this.event(task, `\`${task.checkCommand}\` passed`);
		}
		if (!task.checker || !workspace) {
			this.ready(task);
			return;
		}
		task.status = "reviewing";
		this.save();
		try {
			const checker = await this.deps.startChecker(
				task.workspaceId,
				task.checker,
				this.checkerPrompt(task, workspace.path),
			);
			task.checkerTerminalId = checker.terminalId;
			task.checkerName = checker.name;
			this.event(task, `${checker.name} is checking it`);
		} catch (error) {
			this.block(
				task,
				`The checker could not start: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async onVerdict(task: CityTask, reply: string): Promise<void> {
		const verdict = verdictOf(reply);
		if (!verdict) return;
		task.verdict = {
			ok: verdict.ok,
			text: reply.slice(-VERDICT_TAIL),
			at: this.now(),
		};
		await this.stopChecker(task);
		if (verdict.ok) {
			this.event(task, `${task.checkerName ?? "The checker"} passed it`);
			this.ready(task);
			return;
		}
		this.event(
			task,
			`${task.checkerName ?? "The checker"} found problems: ${verdict.reason}`,
		);
		const agent = this.agent(task.terminalId);
		if (!agent) {
			this.block(task, "Its agent is no longer running");
			return;
		}
		await this.retry(
			task,
			agent,
			`The checker found problems:\n${verdict.reason || reply.slice(-CHECK_TAIL)}`,
		);
	}

	private onPullRequest(task: CityTask, reply: string): void {
		const failed = marker(reply, "PR FAILED");
		const url = pullRequestUrl(reply);
		if (url) {
			task.prUrl = url;
			delete task.prError;
			task.status = "done";
			this.event(task, `Pull request opened: ${url}`);
		} else if (failed) {
			task.prError = failed;
			task.status = "ready";
			this.event(task, `No pull request: ${failed}`);
		}
	}

	private async retry(
		task: CityTask,
		agent: TaskAgent,
		problem: string,
	): Promise<void> {
		try {
			await this.reach(
				agent,
				[
					`[Paradev task ${task.id}] "${task.title}" is not done yet.`,
					problem,
					doneLine(),
				].join("\n\n"),
			);
		} catch (error) {
			this.block(task, error instanceof Error ? error.message : String(error));
			return;
		}
		task.round += 1;
		task.status = "working";
		this.event(task, `Round ${task.round}: sent back to ${task.agentName}`);
	}

	/** Moves tasks onto the terminal their agent continued in after its terminal stopped. */
	private follow(): void {
		const successorOf = this.deps.successorOf;
		if (!successorOf) return;
		let moved = false;
		for (const task of this.state.tasks) {
			const next = successorOf(task.terminalId, task.workspaceId);
			if (!next) continue;
			task.terminalId = next;
			moved = true;
			if (!OPEN.includes(task.status)) continue;
			if (task.status === "working" || task.status === "pr")
				this.interrupted.add(task.id);
			this.event(task, `${task.agentName} continues in a new terminal`);
		}
		if (moved) this.save();
	}

	/** Tells an agent that came back in a new terminal to finish what its old one was doing. */
	private async carryOn(task: CityTask): Promise<void> {
		const agent = this.agent(task.terminalId);
		if (!agent || !OPEN.includes(task.status)) return;
		this.interrupted.delete(task.id);
		const boot = this.deps.bootMs ?? 3000;
		if (boot > 0) await new Promise((r) => setTimeout(r, boot));
		const end =
			task.status === "pr"
				? "End your reply with one line: PR: <the pull request's URL>, or PR FAILED: <why>"
				: doneLine();
		try {
			await this.reach(
				agent,
				[
					`[Paradev task ${task.id}] Your terminal restarted while you worked on "${task.title}". Carry on where you left off.`,
					end,
				].join("\n\n"),
			);
			this.event(task, `Told ${task.agentName} to carry on`);
		} catch (error) {
			this.event(task, error instanceof Error ? error.message : String(error));
		}
	}

	/** Types into the agent's terminal, with a reason a person can act on when it is not connected. */
	private async reach(agent: TaskAgent, text: string): Promise<void> {
		try {
			await this.deps.send(agent, text);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(
				/not active/i.test(reason)
					? `Couldn't reach ${agent.name}: its terminal stopped. Reconnect it in the city, then try again.`
					: `Couldn't reach ${agent.name}: ${reason}`,
			);
		}
	}

	private ready(task: CityTask): void {
		task.status = "ready";
		this.event(task, "Checked, ready for you");
	}

	private block(task: CityTask, reason: string): void {
		task.status = "blocked";
		task.blockedReason = reason;
		this.event(task, `Blocked: ${reason}`);
	}

	private async stopChecker(task: CityTask): Promise<void> {
		if (!task.checkerTerminalId) return;
		const id = task.checkerTerminalId;
		delete task.checkerTerminalId;
		this.save();
		await this.deps.stopAgent(id, task.workspaceId).catch(() => {});
	}

	private brief(
		task: CityTask,
		workspace: { path: string; branch?: string | null },
	): string {
		const checks = [
			task.checkCommand ? `the command \`${task.checkCommand}\`` : "",
			task.checker ? "a second agent reading your change" : "",
		].filter(Boolean);
		return [
			`[Paradev task ${task.id}] ${task.title}`,
			task.brief,
			`Work in your own folder (${workspace.path}${workspace.branch ? `, branch ${workspace.branch}` : ""}) and commit your changes there.`,
			checks.length
				? `Before it reaches the person, it is checked by ${checks.join(" and ")}.`
				: "",
			doneLine(),
		]
			.filter(Boolean)
			.join("\n\n");
	}

	private checkerPrompt(task: CityTask, path: string): string {
		const range = task.baseRef ? `${task.baseRef}..HEAD` : "HEAD~1..HEAD";
		return [
			`You check task ${task.id} for ${task.agentName}, who works in this same folder (${path}).`,
			`The task: ${task.title}`,
			task.brief ? `What done means: ${task.brief}` : "",
			task.report ? `${task.agentName} reports: ${task.report}` : "",
			task.check
				? `\`${task.check.command}\` ${task.check.ok ? "passed" : "failed"}.`
				: "",
			`Read the change with: git log --oneline ${range}, git diff ${task.baseRef ?? "HEAD~1"} (this also shows changes not yet committed) and git status.`,
			"Do not change, commit or delete anything.",
			"End your reply with one line: VERDICT: PASS, or VERDICT: FAIL: <what is wrong and what to fix>",
		]
			.filter(Boolean)
			.join("\n");
	}

	private openTaskOf(terminalId: string): CityTask | undefined {
		return this.state.tasks.find(
			(t) => t.terminalId === terminalId && OPEN.includes(t.status),
		);
	}

	private agent(terminalId: string): TaskAgent | undefined {
		return this.deps.agents().find((a) => a.terminalId === terminalId);
	}

	private task(id: string): CityTask {
		const task = this.state.tasks.find((t) => t.id === id);
		if (!task) throw new Error("That task does not exist");
		return task;
	}

	private event(task: CityTask, text: string): void {
		const at = this.now();
		task.events.push({ at, text });
		task.updatedAt = at;
		this.save();
	}

	private save(): void {
		const open = this.state.tasks.filter((t) => OPEN.includes(t.status));
		const finished = this.state.tasks
			.filter((t) => !OPEN.includes(t.status))
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, KEPT_FINISHED);
		this.state.tasks = [...open, ...finished];
		writeFileSync(this.deps.statePath, JSON.stringify(this.state, null, 2));
		this.deps.onChange?.();
	}
}

function doneLine(): string {
	return [
		"When it is done, end your reply with one line: TASK DONE: <what you did, in one sentence>",
		"If you cannot finish it, end with one line: TASK BLOCKED: <why>",
	].join("\n");
}

/** The text after the last `NAME:` line of a reply, ignoring markdown around it. */
export function marker(reply: string, name: string): string | null {
	const pattern = new RegExp(`^[\\s>*_\`-]*${name}\\s*:\\s*(.*)$`, "i");
	const lines = reply.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const match = pattern.exec(lines[i] ?? "");
		if (match) return (match[1] ?? "").replace(/[*_`]+$/g, "").trim() || name;
	}
	return null;
}

export function verdictOf(
	reply: string,
): { ok: boolean; reason: string } | null {
	const text = marker(reply, "VERDICT");
	if (!text) return null;
	const match = /^(pass|fail)\b[\s:.-]*(.*)$/i.exec(text);
	if (!match) return null;
	return {
		ok: match[1]?.toLowerCase() === "pass",
		reason: (match[2] ?? "").trim(),
	};
}

export function pullRequestUrl(reply: string): string | null {
	const stated = marker(reply, "PR");
	const fromLine = stated?.match(/https?:\/\/\S+/)?.[0];
	const anywhere = reply.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/g);
	return fromLine ?? anywhere?.at(-1) ?? null;
}

function load(path: string): State {
	if (!existsSync(path)) return { next: 1, tasks: [], checkCommands: {} };
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<State>;
		return {
			next: raw.next ?? 1,
			tasks: raw.tasks ?? [],
			checkCommands: raw.checkCommands ?? {},
		};
	} catch {
		return { next: 1, tasks: [], checkCommands: {} };
	}
}
