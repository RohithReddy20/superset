import { describe, expect, test } from "bun:test";
import type { CityAgent, CityProject } from "../../types";
import { buildingSnapshot, YOU_ID } from "./buildingSnapshot";

function agent(
	terminalId: string,
	workspaceId: string,
	status: CityAgent["status"],
	agentId: CityAgent["agentId"] = "claude",
): CityAgent {
	return {
		terminalId,
		workspaceId,
		agentId,
		name: "Claude",
		status,
		startedAt: 0,
		lastEventAt: 5,
		subagents: 0,
	};
}

const project: CityProject = {
	id: "p",
	name: "superset",
	color: null,
	iconUrl: null,
	createdAt: 0,
	workspaces: [
		{
			id: "w1",
			name: "Fix login",
			branch: "fix/login",
			createdAt: 0,
			agents: [
				agent("t1", "w1", "working"),
				agent("t2", "w1", "idle", "gemini"),
			],
		},
		{ id: "w2", name: "local", branch: null, createdAt: 1, agents: [] },
	],
};

describe("buildingSnapshot", () => {
	test("each workspace is a room holding its agents", () => {
		const snapshot = buildingSnapshot(project);
		expect(snapshot.rooms.map((r) => [r.id, r.name, r.members])).toEqual([
			["w1", "Fix login", ["t1", "t2"]],
			["w2", "local", []],
		]);
	});

	test("agents become people in their workspace's room, saying what state they are in", () => {
		const people = buildingSnapshot(project).teammates;
		const working = people.find((t) => t.id === "t1");
		const idle = people.find((t) => t.id === "t2");
		expect(working).toMatchObject({
			kind: "ai",
			roomId: "w1",
			engine: "claude",
			presence: "focused",
			line: "Working",
		});
		expect(idle?.presence).toBe("in-office");
		expect(idle?.line).toBe("");
		expect(idle?.engine).toBeUndefined();
	});

	test("you are there too, outside every workspace room", () => {
		const snapshot = buildingSnapshot(project);
		const you = snapshot.teammates.find((t) => t.id === YOU_ID);
		expect(you?.kind).toBe("human");
		expect(snapshot.rooms.some((r) => r.id === you?.roomId)).toBe(false);
	});
});
