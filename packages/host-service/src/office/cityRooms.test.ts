import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CityAgentInfo,
	CityRooms,
	handlesFor,
	lastAnswer,
	MAX_RELAYS,
	mentioned,
} from "./cityRooms";

function agent(
	terminalId: string,
	workspaceId: string,
	agentId = "claude",
	projectId = "p1",
): CityAgentInfo {
	return {
		terminalId,
		workspaceId,
		projectId,
		agentId,
		label: agentId === "claude" ? "Claude" : "Codex",
		workspaceName: `ws ${workspaceId}`,
		projectName: projectId,
	};
}

function setup(agents: CityAgentInfo[]) {
	const sent: Array<{ to: string; text: string }> = [];
	const replies = new Map<string, string>();
	const rooms = new CityRooms({
		statePath: join(mkdtempSync(join(tmpdir(), "city-")), "city.json"),
		agents: () => agents,
		roomName: (projectId, roomId) =>
			roomId === "meeting"
				? "Meeting room"
				: agents.some(
							(a) => a.projectId === projectId && a.workspaceId === roomId,
						)
					? `ws ${roomId}`
					: null,
		send: async (to, text) => {
			sent.push({ to: to.terminalId, text });
		},
		lastReply: async (a) => replies.get(a.terminalId) ?? null,
		settleMs: 0,
	});
	return { rooms, sent, replies };
}

describe("handlesFor", () => {
	test("names agents by kind, adding the workspace when two of a kind meet", () => {
		const handles = handlesFor([
			agent("t1", "api"),
			agent("t2", "web"),
			agent("t3", "web", "codex"),
		]);
		expect([...handles.values()].sort()).toEqual([
			"claude-ws-api",
			"claude-ws-web",
			"codex",
		]);
	});
});

describe("mentioned", () => {
	const handles = new Map([
		["t1", "claude"],
		["t2", "claude-2"],
		["t3", "codex"],
	]);
	test("finds exact @handles anywhere in the reply, never the speaker", () => {
		expect(mentioned("Hey @codex, can you check?", handles, "t1")).toEqual([
			"t3",
		]);
		expect(mentioned("@claude-2 over to you", handles, "t1")).toEqual(["t2"]);
		expect(mentioned("@claude thanks", handles, "t1")).toEqual([]);
	});
	test("@all reaches everyone but the speaker", () => {
		expect(mentioned("@all done here", handles, "t3")).toEqual(["t1", "t2"]);
	});
});

describe("CityRooms", () => {
	test("seating keeps the workspace and tells the newcomer who is there", async () => {
		const a = agent("t1", "api");
		const b = agent("t2", "docs", "codex");
		const { rooms, sent } = setup([a, b]);
		await rooms.seat("t2", "p1", "api");
		const room = rooms.snapshot().rooms.find((r) => r.roomId === "api");
		expect(room?.members.map((m) => m.handle).sort()).toEqual([
			"claude",
			"codex",
		]);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe("t2");
		expect(sent[0]?.text).toContain("@claude");
		expect(sent[0]?.text).toContain("have not changed");
		await rooms.sendHome("t2");
		expect(rooms.snapshot().seats).toEqual([]);
	});

	test("passes an answer to the roommates it mentions, once", async () => {
		const { rooms, sent, replies } = setup([
			agent("t1", "api"),
			agent("t2", "api", "codex"),
		]);
		replies.set("t1", "@codex what does README.md say?");
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe("t2");
		expect(sent[0]?.text).toStartWith("[from @claude");
		replies.set("t2", "It is empty, nothing to add.");
		await rooms.onAgentEvent({ terminalId: "t2", eventType: "Stop" });
		expect(sent).toHaveLength(1);
	});

	test("pauses a room after too many relays until a person speaks", async () => {
		const { rooms, sent, replies } = setup([
			agent("t1", "api"),
			agent("t2", "api", "codex"),
		]);
		for (let i = 0; i < MAX_RELAYS + 2; i++) {
			const [from, to] = i % 2 === 0 ? ["t1", "codex"] : ["t2", "claude"];
			replies.set(from, `@${to} round ${i}`);
			await rooms.onAgentEvent({ terminalId: from, eventType: "Stop" });
		}
		expect(sent).toHaveLength(MAX_RELAYS);
		expect(rooms.snapshot().rooms[0]?.paused).toBe(true);
		await rooms.say("p1", "api", "carry on");
		expect(rooms.snapshot().rooms[0]?.paused).toBe(false);
		expect(
			sent
				.slice(-2)
				.map((s) => s.to)
				.sort(),
		).toEqual(["t1", "t2"]);
	});

	test("notes in the room when an agent's terminal cannot be reached", async () => {
		const a = agent("t1", "api");
		const b = agent("t2", "api", "codex");
		const rooms = new CityRooms({
			statePath: join(mkdtempSync(join(tmpdir(), "city-")), "city.json"),
			agents: () => [a, b],
			roomName: () => "ws api",
			send: async (to) => {
				if (to.terminalId === "t2") throw new Error("terminal is gone");
			},
			lastReply: async () => null,
			settleMs: 0,
		});
		await rooms.say("p1", "api", "hello");
		const texts = rooms.snapshot().rooms[0]?.messages.map((m) => m.text);
		expect(texts).toContain("Could not reach @codex: terminal is gone");
	});

	test("refuses rooms the project does not have", async () => {
		const { rooms } = setup([agent("t1", "api")]);
		await expect(rooms.seat("t1", "p1", "nowhere")).rejects.toThrow(
			"does not exist",
		);
	});
});

describe("lastAnswer", () => {
	test("is the last Assistant turn of an agent's own record", () => {
		expect(
			lastAnswer(
				"User: hi\n\nAssistant: one\n\nAssistant: two\nlines\n\nUser: next",
				"harness",
			),
		).toBe("two\nlines");
	});
	test("is the end of the output for agents without a record", () => {
		expect(lastAnswer("a\nb\n", "stream")).toBe("a\nb");
	});
});
