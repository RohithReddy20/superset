import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NamedAgent } from "./cityRooms";
import { CityTeam, type CityTeamDeps, YOU } from "./cityTeam";

const agent = (terminalId: string, name: string): NamedAgent => ({
	terminalId,
	workspaceId: `ws-${terminalId}`,
	projectId: "p",
	agentId: "claude",
	label: "Claude",
	workspaceName: `Work ${name}`,
	projectName: "Project",
	name,
});

function setup(over: Partial<CityTeamDeps> = {}) {
	const agents = [agent("t1", "Milo"), agent("t2", "Ada")];
	const replies = new Map<string, string>();
	const sent: Array<{ to: string; text: string }> = [];
	const team = new CityTeam({
		statePath: join(mkdtempSync(join(tmpdir(), "city-team-")), "team.json"),
		agents: () => agents,
		send: async (to, text) => {
			sent.push({ to: to.terminalId, text });
		},
		lastReply: async (from) => replies.get(from.terminalId) ?? null,
		settleMs: 0,
		...over,
	});
	const turn = async (terminalId: string, reply: string) => {
		replies.set(terminalId, reply);
		await team.onAgentEvent({ terminalId, eventType: "Start" });
		await team.onAgentEvent({ terminalId, eventType: "Stop" });
	};
	return { team, agents, sent, turn };
}

describe("CityTeam", () => {
	test("an ask lands on the other's list and reaches its terminal", async () => {
		const { team, sent } = setup();
		const todo = await team.ask({ fromId: "t1", to: "@ada", text: "Run it" });
		expect(todo).toMatchObject({
			ownerId: "t2",
			state: "open",
			askedByName: "Milo",
		});
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe("t2");
		expect(sent[0]?.text).toContain("superset office say @milo");
	});

	test("the asker hears the other's last words when its turn ends", async () => {
		const { team, sent, turn } = setup();
		await team.ask({ fromId: "t1", to: "ada", text: "Run it" });
		await turn("t2", "It passes.");
		expect(sent.at(-1)).toMatchObject({ to: "t1" });
		expect(sent.at(-1)?.text).toContain("It passes.");
		await turn("t2", "Something later.");
		expect(sent).toHaveLength(2);
	});

	test("a turn that was running before the ask arrived is not passed on", async () => {
		const { team, sent } = setup();
		await team.ask({ fromId: "t1", to: "ada", text: "Run it" });
		await team.onAgentEvent({ terminalId: "t2", eventType: "Stop" });
		expect(sent).toHaveLength(1);
	});

	test("writing back answers the ask, so nothing is passed on twice", async () => {
		const { team, sent, turn } = setup();
		await team.ask({ fromId: "t1", to: "ada", text: "Run it" });
		await team.say({ fromId: "t2", to: ["@milo"], text: "It passes." });
		await turn("t2", "Told Milo.");
		expect(sent.map((s) => s.to)).toEqual(["t2", "t1"]);
	});

	test("only the owner moves an item, and finishing tells the asker", async () => {
		const { team, sent } = setup();
		const todo = await team.ask({ fromId: "t1", to: "ada", text: "Run it" });
		await expect(
			team.setTodo({ callerId: "t1", id: todo.id, state: "finished" }),
		).rejects.toThrow(/only its owner/);
		await team.setTodo({ callerId: "t2", id: todo.id, state: "finished" });
		expect(sent.at(-1)?.to).toBe("t1");
		expect(sent.at(-1)?.text).toContain("finished what you asked");
	});

	test("the person is one of the team: asked, listed, and written to", async () => {
		const { team, sent } = setup();
		const todo = await team.ask({ fromId: "t1", to: "@you", text: "Pick one" });
		expect(todo.ownerId).toBe(YOU);
		expect(sent).toHaveLength(0);
		await team.setTodo({ callerId: YOU, id: todo.id, state: "doing" });
		const you = team.snapshot().teammates.find((t) => t.id === YOU);
		expect(you).toMatchObject({ doing: "Pick one", open: 1 });
		expect(team.callerOf("t1")).toBe("t1");
		expect(team.callerOf("unknown")).toBe(YOU);
	});

	test("a list follows its agent into the terminal it continued in", async () => {
		const { team, agents } = setup({
			successorOf: (terminalId) => (terminalId === "t2" ? "t3" : undefined),
		});
		const todo = await team.ask({ fromId: "t1", to: "ada", text: "Run it" });
		agents[1] = { ...agent("t3", "Ada"), workspaceId: "ws-t2" };
		expect(team.snapshot().todos.find((t) => t.id === todo.id)?.ownerId).toBe(
			"t3",
		);
	});
});
