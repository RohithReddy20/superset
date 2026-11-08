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
	SEAT_KEPT_MS,
	saysNoReply,
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
	test("seating keeps the workspace and types nothing into any terminal", async () => {
		const a = agent("t1", "api");
		const b = agent("t2", "docs", "codex");
		const { rooms, sent } = setup([a, b]);
		await rooms.seat("t2", "p1", "api");
		const room = rooms.snapshot().rooms.find((r) => r.roomId === "api");
		expect(room?.members.map((m) => m.handle).sort()).toEqual([
			"claude",
			"codex",
		]);
		expect(sent).toHaveLength(0);
		await rooms.sendHome("t2");
		expect(rooms.snapshot().seats).toEqual([]);
	});

	test("the first message in a room says who is there; later ones only say what changed", async () => {
		const a = agent("t1", "api");
		const b = agent("t2", "docs", "codex");
		const c = agent("t3", "web", "claude", "p1");
		const everyone = [a, b];
		const { rooms, sent } = setup(everyone);
		await rooms.seat("t2", "p1", "api");
		await rooms.say("p1", "api", "first");
		const toCodex = sent.find((m) => m.to === "t2")?.text ?? "";
		expect(toCodex).toContain("as @codex, with @claude");
		expect(toCodex).toContain("are unchanged");
		expect(toCodex).toEndWith("first");
		await rooms.say("p1", "api", "second");
		expect(sent.at(-1)?.text.startsWith("[from the person")).toBe(true);
		everyone.push(c);
		await rooms.seat("t3", "p1", "api");
		await rooms.say("p1", "api", "third");
		const update = sent.filter((m) => m.to === "t2").at(-1)?.text ?? "";
		expect(update).toStartWith('[Paradev office] Now in "ws api"');
		expect(update).toContain("@claude-ws-web");
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
		expect(sent[0]?.text).toContain("[from @claude");
		replies.set("t2", "It is empty, nothing to add.");
		await rooms.onAgentEvent({ terminalId: "t2", eventType: "Stop" });
		expect(sent).toHaveLength(1);
	});

	test("an answer that says no reply is not passed on, even when it names someone", async () => {
		const { rooms, sent, replies } = setup([
			agent("t1", "api"),
			agent("t2", "api", "codex"),
		]);
		replies.set("t1", "@codex answered my question, thanks.\n\nno reply");
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		expect(sent).toHaveLength(0);
		expect(saysNoReply("**No reply.**")).toBe(true);
		expect(saysNoReply("I will reply soon")).toBe(false);
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

	test("a seat follows its agent into the terminal it continued in after a restart", async () => {
		const a = agent("t1", "api");
		const b = agent("t2", "docs", "codex");
		const everyone = [a, b];
		let clock = 0;
		const rooms = new CityRooms({
			statePath: join(mkdtempSync(join(tmpdir(), "city-")), "city.json"),
			agents: () => everyone,
			roomName: () => "ws api",
			send: async () => {},
			lastReply: async () => null,
			successorOf: (terminalId) => (terminalId === "t2" ? "t2b" : undefined),
			now: () => clock,
			settleMs: 0,
		});
		await rooms.seat("t2", "p1", "api");
		everyone.splice(1, 1);
		expect(rooms.snapshot().seats).toEqual([]);
		everyone.push({ ...b, terminalId: "t2b" });
		expect(rooms.snapshot().seats.map((s) => [s.terminalId, s.roomId])).toEqual(
			[["t2b", "api"]],
		);
		clock = SEAT_KEPT_MS * 2;
		everyone.splice(1, 1);
		rooms.snapshot();
		clock += SEAT_KEPT_MS - 1;
		everyone.push({ ...b, terminalId: "t2b" });
		expect(rooms.snapshot().seats).toHaveLength(1);
		everyone.splice(1, 1);
		rooms.snapshot();
		clock += SEAT_KEPT_MS + 1;
		rooms.snapshot();
		everyone.push({ ...b, terminalId: "t2b" });
		expect(rooms.snapshot().seats).toEqual([]);
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

describe("hand-over", () => {
	function handoverSetup() {
		const a = agent("t1", "api");
		const b = agent("t2", "api", "codex");
		const everyone = [a, b];
		const sent: Array<{ to: string; text: string }> = [];
		const started: Array<{
			workspaceId: string;
			agent: string;
			prompt: string;
		}> = [];
		const replies = new Map<string, string>();
		const rooms = new CityRooms({
			statePath: join(mkdtempSync(join(tmpdir(), "city-")), "city.json"),
			agents: () => everyone,
			roomName: (_p, roomId) => (roomId === "api" ? "ws api" : null),
			send: async (to, text) => {
				sent.push({ to: to.terminalId, text });
			},
			lastReply: async (x) => replies.get(x.terminalId) ?? null,
			workspace: (id) =>
				id === "web"
					? {
							projectId: "p2",
							name: "Web app",
							projectName: "web",
							path: "/w/web",
						}
					: id === "api"
						? {
								projectId: "p1",
								name: "ws api",
								projectName: "p1",
								path: "/w/api",
							}
						: null,
			startAgent: async (workspaceId, kind, prompt) => {
				started.push({ workspaceId, agent: kind, prompt });
				everyone.push({
					...agent("t9", "web", kind, "p2"),
					workspaceName: "Web app",
				});
				return { terminalId: "t9" };
			},
			settleMs: 0,
		});
		return { rooms, sent, started, replies };
	}

	test("asks for a brief, starts the new agent with it, and seats it beside the old one", async () => {
		const { rooms, sent, started, replies } = handoverSetup();
		await rooms.handOver({
			terminalId: "t1",
			toWorkspaceId: "web",
			note: "keep it small",
		});
		expect(sent.at(-1)?.to).toBe("t1");
		expect(sent.at(-1)?.text).toContain(
			'Start your reply with the line "HANDOVER BRIEF"',
		);
		replies.set("t1", "HANDOVER BRIEF\nDone: server.js. Left: the client.");
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		expect(started).toHaveLength(1);
		expect(started[0]?.workspaceId).toBe("web");
		expect(started[0]?.prompt).toContain("Done: server.js. Left: the client.");
		expect(started[0]?.prompt).toContain("keep it small");
		expect(started[0]?.prompt).toContain("@claude-ws-api");
		const snapshot = rooms.snapshot();
		expect(snapshot.handovers[0]).toMatchObject({
			status: "done",
			newTerminalId: "t9",
		});
		expect(snapshot.seats.map((s) => [s.terminalId, s.roomId])).toEqual([
			["t9", "api"],
		]);
		expect(sent.at(-1)?.to).toBe("t1");
		expect(sent.at(-1)?.text).toContain("Stop working on it");
	});

	test("an agent's own request waits for a person, who approves or declines it", async () => {
		const { rooms, sent, started, replies } = handoverSetup();
		replies.set(
			"t1",
			"This belongs in the web project.\nHANDOVER REQUEST: web - the client lives there",
		);
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		const [request] = rooms.snapshot().handovers;
		expect(request).toMatchObject({
			status: "asked",
			request: "web - the client lives there",
		});
		expect(started).toHaveLength(0);
		await rooms.declineHandover(request?.id ?? "");
		expect(rooms.snapshot().handovers[0]?.status).toBe("declined");
		expect(sent.at(-1)?.text).toContain("declined");
		replies.set("t1", "HANDOVER REQUEST: web - again");
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		const again = rooms.snapshot().handovers.at(-1);
		await rooms.approveHandover({ id: again?.id ?? "", toWorkspaceId: "web" });
		expect(rooms.snapshot().handovers.at(-1)?.status).toBe("briefing");
	});

	test("refuses the agent's own workspace and unknown ones", async () => {
		const { rooms } = handoverSetup();
		await expect(
			rooms.handOver({ terminalId: "t1", toWorkspaceId: "api" }),
		).rejects.toThrow("different workspace");
		await expect(
			rooms.handOver({ terminalId: "t2", toWorkspaceId: "nope" }),
		).rejects.toThrow("does not exist");
	});
});
