import { describe, expect, test } from "bun:test";
import type { Handoff, Room, Teammate } from "../../types";
import { findPath, isWalkable, layoutWorld, type WorldMap } from "./world";

const map: WorldMap = {
	image: { w: 320, h: 160 },
	spawn: { x: 160, y: 140 },
	blocked: [{ x: 0, y: 0, w: 320, h: 48 }],
	doors: [{ x: 144, y: 0, w: 32, h: 48 }],
	zones: [
		{
			id: "a",
			kind: "team",
			rect: { x: 0, y: 48, w: 160, h: 112 },
			seats: [
				{ x: 40, y: 100, facing: "down" },
				{ x: 80, y: 100, facing: "down" },
			],
		},
		{
			id: "meet",
			kind: "meeting",
			rect: { x: 160, y: 48, w: 160, h: 112 },
			seats: [
				{ x: 200, y: 100, facing: "down" },
				{ x: 240, y: 100, facing: "down" },
			],
		},
	],
};

const teammate = (id: string, extra: Partial<Teammate> = {}): Teammate =>
	({
		id,
		name: id,
		kind: "ai",
		roomId: "eng",
		presence: "in-office",
		line: "",
		lineSince: 0,
		paused: false,
		engine: "claude",
		...extra,
	}) as Teammate;

const rooms = [{ id: "eng", name: "Engineering", kind: "room" }] as Room[];

describe("layoutWorld", () => {
	test("seats room members in the room's zone and overflow elsewhere", () => {
		const layout = layoutWorld({
			map,
			rooms,
			teammates: [teammate("a"), teammate("b"), teammate("c")],
			handoffs: [],
		});
		expect(layout.targets.get("a")?.zoneId).toBe("a");
		expect(layout.targets.get("b")?.zoneId).toBe("a");
		expect(layout.targets.get("c")?.zoneId).toBe("meet");
	});

	test("sends an active hand-off pair to the meeting room", () => {
		const layout = layoutWorld({
			map,
			rooms,
			teammates: [teammate("a"), teammate("b", { presence: "focused" })],
			handoffs: [{ fromId: "a", toId: "b", status: "working" }] as Handoff[],
		});
		expect(layout.targets.get("a")?.zoneId).toBe("meet");
		expect(layout.targets.get("b")?.zoneId).toBe("meet");
	});

	test("blocks cells inside blocked rects except doors", () => {
		const layout = layoutWorld({ map, rooms, teammates: [], handoffs: [] });
		expect(isWalkable(layout, { x: 20, y: 20 })).toBe(false);
		expect(isWalkable(layout, { x: 160, y: 20 })).toBe(true);
		expect(isWalkable(layout, { x: 20, y: 100 })).toBe(true);
	});
});

describe("findPath", () => {
	test("routes through the door and ends exactly at the target", () => {
		const layout = layoutWorld({ map, rooms, teammates: [], handoffs: [] });
		const path = findPath(layout, { x: 20, y: 140 }, { x: 160, y: 10 });
		expect(path.length).toBeGreaterThan(0);
		expect(path.at(-1)).toEqual({ x: 160, y: 10 });
		for (const p of path.slice(0, -1)) expect(isWalkable(layout, p)).toBe(true);
	});

	test("returns an empty path when the target is unreachable", () => {
		const walled: WorldMap = {
			...map,
			doors: [],
			blocked: [{ x: 0, y: 40, w: 320, h: 16 }],
		};
		const layout = layoutWorld({
			map: walled,
			rooms,
			teammates: [],
			handoffs: [],
		});
		expect(findPath(layout, { x: 20, y: 140 }, { x: 20, y: 20 })).toEqual([]);
	});
});
