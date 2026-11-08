import { describe, expect, test } from "bun:test";
import type { CityAgent, CityProject, CityWorkspace } from "../../types";
import { buildingAt, layoutCity, MAX_FLOORS } from "./cityLayout";

function agent(id: string, status: CityAgent["status"], startedAt = 0) {
	return {
		terminalId: id,
		workspaceId: "w",
		projectId: "p",
		workspaceName: "w",
		place: { projectId: "p", roomId: "w" },
		agentId: "claude",
		kind: "Claude",
		name: "Claude",
		handle: "claude",
		status,
		startedAt,
		lastEventAt: 0,
		subagents: 0,
	} satisfies CityAgent;
}

function workspace(id: string, agents: CityAgent[] = []): CityWorkspace {
	return { id, name: id, branch: null, createdAt: 0, agents };
}

function project(
	id: string,
	workspaces: CityWorkspace[],
	createdAt = 0,
): CityProject {
	return { id, name: id, color: null, iconUrl: null, createdAt, workspaces };
}

describe("layoutCity", () => {
	test("gives each project its own lot, with no two buildings overlapping", () => {
		const projects = Array.from({ length: 7 }, (_, i) =>
			project(`p${i}`, [workspace(`w${i}`)], i),
		);
		const { buildings, w, h } = layoutCity(projects);
		expect(buildings.map((b) => b.id)).toEqual(projects.map((p) => p.id));
		for (const a of buildings) {
			expect(a.body.x + a.body.w).toBeLessThanOrEqual(w);
			expect(a.body.y + a.body.h).toBeLessThanOrEqual(h);
			for (const b of buildings) {
				if (a === b) continue;
				const apart =
					a.body.x + a.body.w <= b.body.x ||
					b.body.x + b.body.w <= a.body.x ||
					a.body.y + a.body.h <= b.body.y ||
					b.body.y + b.body.h <= a.body.y;
				expect(apart).toBe(true);
			}
		}
	});

	test("one floor per workspace, its windows lit by its agents in start order", () => {
		const { buildings } = layoutCity([
			project("p", [
				workspace("a", [
					agent("t2", "permission", 2),
					agent("t1", "working", 1),
				]),
				workspace("b"),
			]),
		]);
		const building = buildings[0];
		expect(building?.floors).toBe(2);
		const floorA = building?.windows.filter((w) => w.workspaceId === "a");
		expect(floorA?.map((w) => w.status)).toEqual([
			"working",
			"permission",
			null,
			null,
		]);
	});

	test("caps the height and counts the workspaces left without a floor", () => {
		const many = Array.from({ length: MAX_FLOORS + 3 }, (_, i) =>
			workspace(`w${i}`),
		);
		const building = layoutCity([project("p", many)]).buildings[0];
		expect(building?.floors).toBe(MAX_FLOORS);
		expect(building?.hiddenWorkspaces).toBe(3);
	});

	test("finds the building under a point", () => {
		const layout = layoutCity([project("p", [workspace("w")])]);
		const body = layout.buildings[0]?.body;
		if (!body) throw new Error("no building");
		expect(buildingAt(layout, { x: body.x + 1, y: body.y + 1 })?.id).toBe("p");
		expect(buildingAt(layout, { x: 0, y: 0 })).toBeNull();
	});
});
