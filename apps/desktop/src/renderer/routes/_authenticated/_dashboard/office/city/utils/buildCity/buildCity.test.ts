import { describe, expect, test } from "bun:test";
import { type BindingRow, buildCity, type WorkspaceRow } from "./buildCity";

const projects = [
	{ id: "p1", name: "superset", color: null, iconUrl: null, createdAt: 1 },
	{ id: "p2", name: "jobs", color: null, iconUrl: null, createdAt: 2 },
	{ id: "p3", name: "empty", color: null, iconUrl: null, createdAt: 3 },
];

function workspace(
	id: string,
	projectId: string | null,
	hostId = "me",
): WorkspaceRow {
	return { id, name: id, branch: "main", projectId, hostId, createdAt: 0 };
}

function binding(
	terminalId: string,
	workspaceId: string,
	lastEventType: string,
	startedAt = 0,
): BindingRow {
	return {
		terminalId,
		workspaceId,
		agentId: "claude",
		startedAt,
		lastEventAt: 10,
		lastEventType,
	};
}

describe("buildCity", () => {
	test("keeps projects with a workspace on this machine and leaves out the rest", () => {
		const city = buildCity({
			projects,
			workspaces: [
				workspace("w1", "p1"),
				workspace("w2", "p2", "other-machine"),
				workspace("s1", null),
			],
			bindings: [],
			seats: [],
			seenAt: {},
			machineId: "me",
		});
		expect(city.map((p) => p.id)).toEqual(["p1"]);
	});

	test("puts each agent in its workspace with a status and its city name, else its kind", () => {
		const city = buildCity({
			projects,
			workspaces: [workspace("w1", "p1")],
			bindings: [
				binding("t2", "w1", "PermissionRequest", 2),
				binding("t1", "w1", "Start", 1),
			],
			seats: [],
			names: [{ terminalId: "t2", name: "Ada", handle: "ada" }],
			seenAt: {},
			machineId: "me",
		});
		const agents = city[0]?.workspaces[0]?.agents;
		expect(
			agents?.map((a) => [a.terminalId, a.name, a.handle, a.status]),
		).toEqual([
			["t1", "Claude", "", "working"],
			["t2", "Ada", "ada", "permission"],
		]);
	});

	test("an agent whose terminal stopped shows as disconnected in its seat, even once its binding is gone", () => {
		const city = buildCity({
			projects,
			workspaces: [workspace("w1", "p1"), workspace("w2", "p1")],
			bindings: [binding("t1", "w1", "Stop", 1)],
			seats: [{ terminalId: "t2", projectId: "p1", roomId: "w1" }],
			lost: [
				{
					terminalId: "t1",
					name: "Ada",
					handle: "ada",
					workspaceId: "w1",
					agentId: "claude",
					startedAt: 1,
					since: 20,
					resumable: true,
				},
				{
					terminalId: "t2",
					name: "Bolt",
					handle: "bolt",
					workspaceId: "w2",
					agentId: "codex",
					startedAt: 2,
					since: 30,
					resumable: false,
				},
			],
			seenAt: {},
			machineId: "me",
		});
		const agents = city[0]?.workspaces.flatMap((w) => w.agents);
		expect(
			agents?.map((a) => [a.name, a.status, a.lost?.resumable, a.place.roomId]),
		).toEqual([
			["Ada", "lost", true, "w1"],
			["Bolt", "lost", false, "w1"],
		]);
	});

	test("a finished turn reads as done until you have seen it", () => {
		const run = (seenAt: Record<string, number>) =>
			buildCity({
				projects,
				workspaces: [workspace("w1", "p1")],
				bindings: [binding("t1", "w1", "Stop")],
				seats: [],
				seenAt,
				machineId: "me",
			})[0]?.workspaces[0]?.agents[0]?.status;
		expect(run({})).toBe("review");
		expect(run({ t1: 20 })).toBe("idle");
	});

	test("an agent sits where it was seated, its workspace unchanged", () => {
		const city = buildCity({
			projects,
			workspaces: [workspace("w1", "p1"), workspace("w2", "p2")],
			bindings: [binding("t1", "w1", "Start")],
			seats: [{ terminalId: "t1", projectId: "p2", roomId: "meeting" }],
			seenAt: {},
			machineId: "me",
		});
		const agent = city[0]?.workspaces[0]?.agents[0];
		expect(agent?.workspaceId).toBe("w1");
		expect(agent?.place).toEqual({ projectId: "p2", roomId: "meeting" });
	});
});

describe("buildCity with a question on screen", () => {
	test("an agent asking on its screen needs you, unless it failed", () => {
		const city = buildCity({
			projects,
			workspaces: [workspace("w1", "p1")],
			bindings: [
				binding("fresh", "w1", "Attached"),
				binding("broke", "w1", "Failed"),
			],
			seats: [],
			asks: new Map([
				["fresh", { question: "Trust this folder?", trust: true }],
				["broke", { question: "Retry?", trust: false }],
			]),
			seenAt: {},
			machineId: "me",
		});
		const [fresh, broke] = city[0]?.workspaces[0]?.agents ?? [];
		expect(fresh?.status).toBe("permission");
		expect(fresh?.asking).toEqual({
			question: "Trust this folder?",
			trust: true,
		});
		expect(broke?.status).toBe("failed");
		expect(broke?.asking).toBeUndefined();
	});
});
