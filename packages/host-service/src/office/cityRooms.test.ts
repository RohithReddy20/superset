import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CityAgentInfo,
	CityRooms,
	handlesFor,
	type LostAgent,
	lastAnswer,
	mentioned,
	OFFICE_CLI,
	SEAT_KEPT_MS,
	saysNoReply,
	teamCommands,
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

function lostAgent(terminalId: string): LostAgent {
	return {
		terminalId,
		workspaceId: "docs",
		agentId: "codex",
		startedAt: 0,
		since: 1,
		resumable: true,
	};
}

function lostSetup() {
	const everyone = [agent("t1", "api"), agent("t2", "docs", "codex")];
	const lost: LostAgent[] = [];
	const stopped: string[] = [];
	const rooms = new CityRooms({
		statePath: join(mkdtempSync(join(tmpdir(), "city-")), "city.json"),
		agents: () => everyone,
		roomName: () => "ws api",
		send: async () => {},
		lastReply: async () => null,
		lostAgents: () => lost,
		resumeAgent: async () => ({ terminalId: "t2b" }),
		stopAgent: async (terminalId) => {
			stopped.push(terminalId);
		},
		settleMs: 0,
	});
	return { rooms, everyone, lost, stopped };
}

describe("handlesFor", () => {
	test("makes handles from names, numbering a clash", () => {
		const handles = handlesFor([
			{ ...agent("t1", "api"), name: "Ada" },
			{ ...agent("t2", "web"), name: "Big Bo" },
			{ ...agent("t3", "web", "codex"), name: "ada" },
		]);
		expect([...handles.values()]).toEqual(["ada", "big-bo", "ada-2"]);
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
		expect(room?.members.map((m) => m.handle).sort()).toEqual(["ada", "milo"]);
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
		expect(toCodex).toStartWith(
			"[Paradev office] You are Milo (@milo), a Codex agent",
		);
		expect(toCodex).toContain("as @milo, with @ada");
		expect(toCodex).toContain("are unchanged");
		expect(toCodex).toEndWith("first");
		await rooms.say("p1", "api", "second");
		expect(sent.at(-1)?.text.startsWith("[from the person")).toBe(true);
		everyone.push(c);
		await rooms.seat("t3", "p1", "api");
		await rooms.say("p1", "api", "third");
		const update = sent.filter((m) => m.to === "t2").at(-1)?.text ?? "";
		expect(update).toStartWith('[Paradev office] Now in "ws api"');
		expect(update).toContain("@iris");
	});

	test("passes an answer to the roommates it mentions, once", async () => {
		const { rooms, sent, replies } = setup([
			agent("t1", "api"),
			agent("t2", "api", "codex"),
		]);
		replies.set("t1", "@milo what does README.md say?");
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe("t2");
		expect(sent[0]?.text).toContain("[from @ada in");
		replies.set("t2", "It is empty, nothing to add.");
		await rooms.onAgentEvent({ terminalId: "t2", eventType: "Stop" });
		expect(sent).toHaveLength(1);
	});

	test("an answer that says no reply is not passed on, even when it names someone", async () => {
		const { rooms, sent, replies } = setup([
			agent("t1", "api"),
			agent("t2", "api", "codex"),
		]);
		replies.set("t1", "@milo answered my question, thanks.\n\nno reply");
		await rooms.onAgentEvent({ terminalId: "t1", eventType: "Stop" });
		expect(sent).toHaveLength(0);
		expect(saysNoReply("**No reply.**")).toBe(true);
		expect(saysNoReply("I will reply soon")).toBe(false);
	});

	test("passes every message on, however long agents talk", async () => {
		const { rooms, sent, replies } = setup([
			agent("t1", "api"),
			agent("t2", "api", "codex"),
		]);
		for (let i = 0; i < 20; i++) {
			const [from, to] = i % 2 === 0 ? ["t1", "milo"] : ["t2", "ada"];
			replies.set(from, `@${to} round ${i}`);
			await rooms.onAgentEvent({ terminalId: from, eventType: "Stop" });
		}
		expect(sent).toHaveLength(20);
		await rooms.say("p1", "api", "carry on");
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
		expect(texts).toContain("Could not reach @milo: terminal is gone");
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
		expect(rooms.snapshot().names.map((n) => [n.terminalId, n.name])).toEqual([
			["t1", "Ada"],
			["t2b", "Milo"],
		]);
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

	test("a lost agent keeps its seat, and reconnecting moves its name and seat to the new terminal", async () => {
		const { rooms, everyone, lost } = lostSetup();
		await rooms.seat("t2", "p1", "api");
		everyone.splice(1, 1);
		lost.push(lostAgent("t2"));
		expect(rooms.snapshot().lost.map((l) => [l.terminalId, l.name])).toEqual([
			["t2", "Milo"],
		]);
		expect(rooms.snapshot().seats.map((s) => s.terminalId)).toEqual(["t2"]);

		await rooms.reconnect("t2");
		lost.splice(0);
		expect(rooms.snapshot().lost).toMatchObject([
			{ terminalId: "t2b", name: "Milo", reconnecting: true },
		]);
		everyone.push(agent("t2b", "docs", "codex"));
		const after = rooms.snapshot();
		expect(after.lost).toEqual([]);
		expect(after.names.map((n) => [n.terminalId, n.name])).toEqual([
			["t1", "Ada"],
			["t2b", "Milo"],
		]);
		expect(after.seats.map((s) => [s.terminalId, s.roomId])).toEqual([
			["t2b", "api"],
		]);
	});

	test("removing a lost agent ends it and takes it out of the city", async () => {
		const { rooms, everyone, lost, stopped } = lostSetup();
		rooms.snapshot();
		everyone.splice(1, 1);
		lost.push(lostAgent("t2"));
		await expect(rooms.remove("t1")).rejects.toThrow("Only a disconnected");

		await rooms.remove("t2");
		lost.splice(0);
		expect(stopped).toEqual(["t2"]);
		expect(rooms.snapshot().lost).toEqual([]);
	});

	test("refuses rooms the project does not have", async () => {
		const { rooms } = setup([agent("t1", "api")]);
		await expect(rooms.seat("t1", "p1", "nowhere")).rejects.toThrow(
			"does not exist",
		);
	});
});

describe("names", () => {
	test("a renamed agent answers to its new handle and is told its name once", async () => {
		const { rooms, sent } = setup([agent("t1", "api"), agent("t2", "api")]);
		rooms.rename("t1", "  Big   Bo ");
		expect(rooms.snapshot().names.map((n) => n.handle)).toEqual([
			"big-bo",
			"milo",
		]);
		expect(() => rooms.rename("t2", "big bo")).toThrow("already called");
		expect(() => rooms.rename("t2", "All")).toThrow("talking to everyone");
		await rooms.tell("t1", "hi");
		await rooms.tell("t1", "again");
		expect(sent.map((m) => m.text)).toEqual([
			`[Paradev office] You are Big Bo (@big-bo), a Claude agent working in workspace "ws api" of project p1. When someone asks who you are, use this name.\n\n${teamCommands(OFFICE_CLI)}\n\nhi`,
			"again",
		]);
		rooms.rename("t1", "Ada");
		await rooms.tell("t1", "and now");
		expect(sent.at(-1)?.text).toStartWith(
			"[Paradev office] You are Ada (@ada)",
		);
		expect(sent.at(-1)?.text).not.toContain(teamCommands(OFFICE_CLI));
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
		const { rooms, sent, started } = handoverSetup();
		await rooms.handOver({
			terminalId: "t1",
			toWorkspaceId: "web",
			note: "keep it small",
		});
		expect(sent.at(-1)?.to).toBe("t1");
		expect(sent.at(-1)?.text).toContain('superset office handover web "');
		await rooms.handOverWithBrief({
			terminalId: "t1",
			toWorkspaceId: "web",
			brief: "Done: server.js. Left: the client.",
		});
		expect(started).toHaveLength(1);
		expect(started[0]?.workspaceId).toBe("web");
		expect(started[0]?.prompt).toContain("Done: server.js. Left: the client.");
		expect(started[0]?.prompt).toContain("keep it small");
		expect(started[0]?.prompt).toStartWith(
			'[Paradev office] You are Iris (@iris) working in workspace "Web app"',
		);
		expect(started[0]?.prompt).toContain("superset office ask @ada");
		const snapshot = rooms.snapshot();
		expect(snapshot.handovers[0]).toMatchObject({
			status: "done",
			newTerminalId: "t9",
		});
		expect(snapshot.seats.map((s) => [s.terminalId, s.roomId])).toEqual([
			["t9", "api"],
		]);
		expect(snapshot.names.find((n) => n.terminalId === "t9")?.name).toBe(
			"Iris",
		);
	});

	test("an agent hands its own work on with its brief, with nobody approving", async () => {
		const { rooms, started } = handoverSetup();
		const handover = await rooms.handOverWithBrief({
			terminalId: "t1",
			toWorkspaceId: "web",
			brief: "The client lives there. Left: wire it up.",
		});
		expect(handover).toMatchObject({ requestedBy: "agent", status: "done" });
		expect(started[0]?.prompt).toContain("Left: wire it up.");
		await expect(
			rooms.handOverWithBrief({
				terminalId: "t1",
				toWorkspaceId: "api",
				brief: "x",
			}),
		).rejects.toThrow("different workspace");
	});

	test("starting a CLI names it and tells it who it is with its first task", async () => {
		const { rooms, started } = handoverSetup();
		expect(
			await rooms.start({
				workspaceId: "web",
				agent: "claude",
				prompt: "fix it",
			}),
		).toEqual({ terminalId: "t9", name: "Iris" });
		expect(started[0]?.prompt).toStartWith(
			'[Paradev office] You are Iris (@iris) working in workspace "Web app"',
		);
		expect(started[0]?.prompt).toEndWith("fix it");
		expect(rooms.snapshot().names.map((n) => n.name)).toEqual([
			"Ada",
			"Milo",
			"Iris",
		]);
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
