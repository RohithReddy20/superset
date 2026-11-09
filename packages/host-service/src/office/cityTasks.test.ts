import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CityTasks,
	type CityTasksDeps,
	marker,
	pullRequestUrl,
	type TaskAgent,
	verdictOf,
} from "./cityTasks";

const worker: TaskAgent = {
	terminalId: "w1",
	workspaceId: "ws",
	projectId: "p",
	agentId: "codex",
	name: "Milo",
};

function setup(over: Partial<CityTasksDeps> = {}) {
	const agents: TaskAgent[] = [worker];
	const replies = new Map<string, string>();
	const sent: Array<{ to: string; text: string }> = [];
	const stopped: string[] = [];
	const started: string[] = [];
	const tasks = new CityTasks({
		statePath: join(mkdtempSync(join(tmpdir(), "city-tasks-")), "t.json"),
		agents: () => agents,
		workspace: () => ({ path: "/repo", branch: "feat", name: "Feat" }),
		send: async (agent, text) => {
			sent.push({ to: agent.terminalId, text });
		},
		lastReply: async (agent) => replies.get(agent.terminalId) ?? null,
		startChecker: async (workspaceId, agent, prompt) => {
			started.push(prompt);
			agents.push({
				terminalId: "c1",
				workspaceId,
				projectId: "p",
				agentId: agent,
				name: "Ada",
			});
			return { terminalId: "c1", name: "Ada" };
		},
		stopAgent: async (terminalId) => {
			stopped.push(terminalId);
		},
		runCheck: async () => ({ ok: true, output: "ok" }),
		headOf: async () => "abc123",
		settleMs: 0,
		...over,
	});
	const say = async (terminalId: string, reply: string) => {
		replies.set(terminalId, reply);
		await tasks.onAgentEvent({ terminalId, eventType: "Stop" });
	};
	return { tasks, agents, sent, stopped, started, say };
}

describe("CityTasks", () => {
	test("a task passes its check and its checker, then waits for you", async () => {
		const { tasks, sent, stopped, started, say } = setup();
		const task = await tasks.give({
			terminalId: "w1",
			title: "Add a health check",
			brief: "GET /health returns ok",
			checkCommand: "bun test",
			checker: "claude",
		});
		expect(sent[0]?.text).toContain("TASK DONE:");

		await say("w1", "Added the route.\n**TASK DONE: added GET /health**");
		expect(task.status).toBe("reviewing");
		expect(task.check?.ok).toBe(true);
		expect(started[0]).toContain("git diff abc123");

		await say("c1", "Looks right.\nVERDICT: PASS");
		expect(task.status).toBe("ready");
		expect(stopped).toEqual(["c1"]);
		expect(tasks.snapshot().checkCommands).toEqual({ p: "bun test" });
	});

	test("a failing check goes back to the agent until the rounds run out", async () => {
		const { tasks, sent, say } = setup({
			runCheck: async () => ({ ok: false, output: "1 test failed" }),
		});
		const task = await tasks.give({
			terminalId: "w1",
			title: "Fix it",
			brief: "",
			checkCommand: "bun test",
		});
		await say("w1", "TASK DONE: fixed");
		expect(task.status).toBe("working");
		expect(task.round).toBe(2);
		expect(sent.at(-1)?.text).toContain("1 test failed");

		await say("w1", "TASK DONE: fixed again");
		await say("w1", "TASK DONE: really fixed");
		expect(task.status).toBe("blocked");
		expect(task.blockedReason).toBe("Still failing after 3 rounds");
	});

	test("the checker's problems go back to the agent", async () => {
		const { tasks, sent, say } = setup();
		const task = await tasks.give({
			terminalId: "w1",
			title: "Fix it",
			brief: "",
			checker: "claude",
		});
		await say("w1", "TASK DONE: fixed");
		await say("c1", "VERDICT: FAIL: the route returns 500");
		expect(task.status).toBe("working");
		expect(sent.at(-1)).toMatchObject({ to: "w1" });
		expect(sent.at(-1)?.text).toContain("the route returns 500");
	});

	test("an approved task ends with the pull request the agent opened", async () => {
		const { tasks, say } = setup();
		const task = await tasks.give({
			terminalId: "w1",
			title: "Docs",
			brief: "",
		});
		await say("w1", "TASK DONE: wrote docs");
		expect(task.status).toBe("ready");

		await tasks.askForPullRequest(task.id);
		await say("w1", "Pushed.\nPR: https://github.com/acme/app/pull/42");
		expect(task.status).toBe("done");
		expect(task.prUrl).toBe("https://github.com/acme/app/pull/42");
	});

	test("a pull request the agent could not open leaves the task with you, saying why", async () => {
		const { tasks, say } = setup();
		const task = await tasks.give({
			terminalId: "w1",
			title: "Docs",
			brief: "",
		});
		await say("w1", "TASK DONE: wrote docs");
		await tasks.askForPullRequest(task.id);
		await say("w1", "PR FAILED: the repository has no remote");
		expect(task.status).toBe("ready");
		expect(task.prError).toBe("the repository has no remote");
	});
});

describe("CityTasks when the agent's terminal is not connected", () => {
	test("nothing changes, and the error says what to do", async () => {
		let connected = true;
		const { tasks, say } = setup({
			send: async () => {
				if (!connected)
					throw new Error('Terminal session "w1" is not active; create it');
			},
		});
		const task = await tasks.give({
			terminalId: "w1",
			title: "Docs",
			brief: "",
		});
		await say("w1", "TASK DONE: wrote docs");
		connected = false;

		await expect(tasks.askForPullRequest(task.id)).rejects.toThrow(
			"Couldn't reach Milo: its terminal stopped. Reconnect it in the city, then try again.",
		);
		expect(task.status).toBe("ready");
		await expect(
			tasks.give({ terminalId: "w1", title: "More", brief: "" }),
		).rejects.toThrow("already has a task");
		tasks.close(task.id);
		await expect(
			tasks.give({ terminalId: "w1", title: "More", brief: "" }),
		).rejects.toThrow("Couldn't reach Milo");
		expect(tasks.snapshot().tasks.map((t) => t.id)).toEqual(["C-1"]);
	});
});

describe("CityTasks when the agent continues in a new terminal", () => {
	test("the task follows it, and it is told to carry on once it is up", async () => {
		const successors = new Map<string, string>();
		const { tasks, agents, sent, say } = setup({
			successorOf: (terminalId) => successors.get(terminalId),
			bootMs: 0,
		});
		const task = await tasks.give({
			terminalId: "w1",
			title: "Docs",
			brief: "",
		});

		successors.set("w1", "w2");
		agents.splice(0, 1, { ...worker, terminalId: "w2" });
		await tasks.onAgentEvent({ terminalId: "w2", eventType: "Attached" });
		expect(task.terminalId).toBe("w2");
		expect(sent.at(-1)).toMatchObject({ to: "w2" });
		expect(sent.at(-1)?.text).toContain("Carry on where you left off");

		await say("w2", "TASK DONE: wrote docs");
		expect(task.status).toBe("ready");
	});
});

describe("reply markers", () => {
	test("reads the last marked line, through markdown", () => {
		expect(marker("TASK DONE: a\n- **TASK DONE: b**", "TASK DONE")).toBe("b");
		expect(marker("no marker here", "TASK DONE")).toBeNull();
		expect(verdictOf("`VERDICT: FAIL: missing test`")).toEqual({
			ok: false,
			reason: "missing test",
		});
		expect(verdictOf("VERDICT: maybe")).toBeNull();
		expect(pullRequestUrl("PR FAILED: no remote")).toBeNull();
	});
});
