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
			seenAt: {},
			machineId: "me",
		});
		expect(city.map((p) => p.id)).toEqual(["p1"]);
	});

	test("puts each agent in its workspace with a status and a name that tells two apart", () => {
		const city = buildCity({
			projects,
			workspaces: [workspace("w1", "p1")],
			bindings: [
				binding("t2", "w1", "PermissionRequest", 2),
				binding("t1", "w1", "Start", 1),
			],
			seenAt: {},
			machineId: "me",
		});
		const agents = city[0]?.workspaces[0]?.agents;
		expect(agents?.map((a) => [a.terminalId, a.name, a.status])).toEqual([
			["t1", "Claude", "working"],
			["t2", "Claude 2", "permission"],
		]);
	});

	test("a finished turn reads as done until you have seen it", () => {
		const run = (seenAt: Record<string, number>) =>
			buildCity({
				projects,
				workspaces: [workspace("w1", "p1")],
				bindings: [binding("t1", "w1", "Stop")],
				seenAt,
				machineId: "me",
			})[0]?.workspaces[0]?.agents[0]?.status;
		expect(run({})).toBe("review");
		expect(run({ t1: 20 })).toBe("idle");
	});
});
