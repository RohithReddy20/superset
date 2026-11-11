import { describe, expect, test } from "bun:test";
import type { CityAgent, CityProject } from "../../types";
import {
	buildingSnapshot,
	MEETING_ROOM,
	presentIn,
	YOU_ID,
} from "./buildingSnapshot";

function agent(
	terminalId: string,
	workspaceId: string,
	status: CityAgent["status"],
	place?: CityAgent["place"],
	agentId: CityAgent["agentId"] = "claude",
): CityAgent {
	return {
		terminalId,
		workspaceId,
		projectId: workspaceId === "x1" ? "other" : "p",
		workspaceName: workspaceId === "x1" ? "Fix header" : "Fix login",
		agentId,
		kind: "Claude",
		name: "Claude",
		handle: "claude",
		status,
		startedAt: 0,
		lastEventAt: 5,
		subagents: 0,
		place: place ?? {
			projectId: workspaceId === "x1" ? "other" : "p",
			roomId: workspaceId,
		},
	};
}

const home = agent("t1", "w1", "working");
const idle = agent("t2", "w1", "idle", undefined, "gemini");
const visitor = agent("t3", "x1", "review", {
	projectId: "p",
	roomId: "meeting",
});
const away = agent("t4", "w1", "idle", { projectId: "other", roomId: "x1" });

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
			agents: [home, idle, away],
		},
		{ id: "w2", name: "local", branch: null, createdAt: 1, agents: [] },
	],
};

describe("buildingSnapshot", () => {
	const present = presentIn("p", [home, idle, visitor, away]);
	const snapshot = buildingSnapshot(project, present);

	test("has a room per workspace and a meeting room, each holding who sits there", () => {
		expect(snapshot.rooms.map((r) => [r.id, r.members])).toEqual([
			["w1", ["t1", "t2"]],
			["w2", []],
			[MEETING_ROOM.id, ["t3"]],
		]);
		expect(snapshot.rooms.at(-1)?.place).toBe("meeting");
	});

	test("agents that went to another building are not here; visitors say where they work", () => {
		const byId = new Map(snapshot.teammates.map((t) => [t.id, t]));
		expect(byId.has("t4")).toBe(false);
		expect(byId.get("t3")).toMatchObject({
			name: "Claude",
			from: "Fix header",
		});
		expect(byId.get("t1")?.from).toBeUndefined();
	});

	test("a line says what needs you or what it is on, not plain working; you start outside every room", () => {
		const working = snapshot.teammates.find((t) => t.id === "t1");
		expect(working).toMatchObject({ line: "", engine: "claude" });
		const carrying = buildingSnapshot(
			project,
			present,
			new Map([["t1", { doing: "Draft the check", next: null }]]),
		);
		expect(carrying.teammates.find((t) => t.id === "t1")).toMatchObject({
			presence: "focused",
			line: "Draft the check",
		});
		const failed = buildingSnapshot(project, [agent("t5", "w1", "failed")]);
		expect(failed.teammates.find((t) => t.id === "t5")?.line).toBe(
			"Stopped with an error",
		);
		expect(snapshot.teammates.find((t) => t.id === "t2")?.line).toBe("");
		const you = snapshot.teammates.find((t) => t.id === YOU_ID);
		expect(snapshot.rooms.some((r) => r.id === you?.roomId)).toBe(false);
	});
});
