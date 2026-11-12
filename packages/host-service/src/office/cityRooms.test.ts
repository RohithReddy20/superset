import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CityAgentInfo,
	CityRooms,
	handlesFor,
	type LostAgent,
	lastAnswer,
	OFFICE_CLI,
	SEAT_KEPT_MS,
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
		lostAgents: () => lost,
		resumeAgent: async () => ({ terminalId: "t2b" }),
		stopAgent: async (terminalId) => {
			stopped.push(terminalId);
		},
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
			successorOf: (terminalId) => (terminalId === "t2" ? "t2b" : undefined),
			now: () => clock,
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

	test("removing an agent ends it, whether it runs or not", async () => {
		const { rooms, everyone, lost, stopped } = lostSetup();
		rooms.snapshot();
		everyone.splice(1, 1);
		lost.push(lostAgent("t2"));
		await expect(rooms.remove("nobody")).rejects.toThrow("already gone");

		await rooms.remove("t2");
		lost.splice(0);
		expect(stopped).toEqual(["t2"]);
		expect(rooms.snapshot().lost).toEqual([]);
		await rooms.remove("t1");
		expect(stopped).toEqual(["t2", "t1"]);
	});

	test("a room names who sits in it, visitors included", async () => {
		const { rooms } = setup([agent("t1", "api"), agent("t2", "web", "codex")]);
		await rooms.seat("t2", "p1", "api");
		expect(rooms.roomOf("t1")).toMatchObject({
			name: "ws api",
			memberIds: ["t1", "t2"],
		});
		expect(rooms.roomAt({ projectId: "p1", roomId: "nowhere" })).toBeNull();
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

describe("team commands", () => {
	test("an agent told older commands is told the new ones once", async () => {
		const statePath = join(mkdtempSync(join(tmpdir(), "city-")), "city.json");
		writeFileSync(
			statePath,
			JSON.stringify({
				names: [
					{
						terminalId: "t1",
						workspaceId: "api",
						name: "Ada",
						told: true,
						briefed: true,
					},
				],
			}),
		);
		const sent: string[] = [];
		const rooms = new CityRooms({
			statePath,
			agents: () => [agent("t1", "api")],
			roomName: () => "ws api",
			send: async (_to, text) => {
				sent.push(text);
			},
		});
		await rooms.tell("t1", "hi");
		await rooms.tell("t1", "again");
		expect(sent).toEqual([
			`The team's commands changed. ${teamCommands(OFFICE_CLI)}\n\nhi`,
			"again",
		]);
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
			model?: string;
			effort?: string;
		}> = [];
		const replies = new Map<string, string>();
		const rooms = new CityRooms({
			statePath: join(mkdtempSync(join(tmpdir(), "city-")), "city.json"),
			agents: () => everyone,
			roomName: (_p, roomId) => (roomId === "api" ? "ws api" : null),
			send: async (to, text) => {
				sent.push({ to: to.terminalId, text });
			},
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
			startAgent: async (workspaceId, kind, prompt, options) => {
				started.push({ workspaceId, agent: kind, prompt, ...options });
				everyone.push({
					...agent("t9", "web", kind, "p2"),
					workspaceName: "Web app",
				});
				return { terminalId: "t9" };
			},
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

	test("a CLI can be started under a name the person chose", async () => {
		const { rooms } = handoverSetup();
		expect(rooms.snapshot().nextName).toBe("Iris");
		expect(
			(
				await rooms.start({
					workspaceId: "web",
					agent: "claude",
					prompt: "",
					name: " Big  Bo ",
				})
			).name,
		).toBe("Big Bo");
		await expect(
			rooms.start({
				workspaceId: "web",
				agent: "claude",
				prompt: "",
				name: "big bo",
			}),
		).rejects.toThrow("already called");
	});

	test("a CLI is started with the model and effort the person chose, and the city shows them", async () => {
		const { rooms, started } = handoverSetup();
		await rooms.start({
			workspaceId: "web",
			agent: "claude",
			prompt: "",
			model: "opus",
			effort: "high",
		});
		expect(started[0]).toMatchObject({ model: "opus", effort: "high" });
		expect(rooms.snapshot().names.find((n) => n.name === "Iris")).toMatchObject(
			{ model: "opus", effort: "high" },
		);
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
