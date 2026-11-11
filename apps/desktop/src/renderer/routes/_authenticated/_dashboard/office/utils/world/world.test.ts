import { describe, expect, test } from "bun:test";
import type { Handoff, Room, Teammate } from "../../types";
import {
	changedDesks,
	findPath,
	isWalkable,
	layoutWorld,
	pathHead,
	pathTail,
	storedDesks,
	type WorldMap,
} from "./world";

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
	test("keeps everyone's seat when others come and go, and seats a newcomer near its drop", () => {
		const pod: WorldMap = {
			...map,
			zones: [
				{
					...(map.zones[0] as WorldMap["zones"][number]),
					seats: [
						{ x: 40, y: 100, facing: "down" },
						{ x: 80, y: 100, facing: "down" },
						{ x: 120, y: 100, facing: "down" },
					],
				},
			],
		};
		const seatOf = (layout: ReturnType<typeof layoutWorld>, id: string) =>
			layout.homes.get(id)?.x;
		const first = layoutWorld({
			map: pod,
			rooms,
			teammates: [teammate("b"), teammate("c")],
			handoffs: [],
		});
		expect([seatOf(first, "b"), seatOf(first, "c")]).toEqual([40, 80]);

		const joined = layoutWorld({
			map: pod,
			rooms,
			teammates: [teammate("a"), teammate("b"), teammate("c")],
			handoffs: [],
			previous: first.homes,
		});
		expect([
			seatOf(joined, "a"),
			seatOf(joined, "b"),
			seatOf(joined, "c"),
		]).toEqual([120, 40, 80]);

		const left = layoutWorld({
			map: pod,
			rooms,
			teammates: [teammate("a"), teammate("c")],
			handoffs: [],
			previous: joined.homes,
		});
		expect([seatOf(left, "a"), seatOf(left, "c")]).toEqual([120, 80]);

		const dropped = layoutWorld({
			map: pod,
			rooms,
			teammates: [teammate("a"), teammate("c"), teammate("d")],
			handoffs: [],
			previous: left.homes,
			hints: new Map([["d", { roomId: "eng", near: { x: 45, y: 104 } }]]),
		});
		expect(seatOf(dropped, "d")).toBe(40);
	});

	test("with no earlier layout, those who came first keep their seats when a newcomer sorts before them", () => {
		const seatOf = (layout: ReturnType<typeof layoutWorld>, id: string) =>
			layout.homes.get(id)?.x;
		const old = [
			teammate("m", { joinedAt: 1 }),
			teammate("z", { joinedAt: 2 }),
		];
		const before = layoutWorld({
			map,
			rooms,
			teammates: old,
			handoffs: [],
		});
		const after = layoutWorld({
			map,
			rooms,
			teammates: [teammate("a", { joinedAt: 3 }), ...old],
			handoffs: [],
		});
		expect(seatOf(after, "m")).toBe(seatOf(before, "m"));
		expect(seatOf(after, "z")).toBe(seatOf(before, "z"));
	});

	describe("stored desks", () => {
		const pods: WorldMap = {
			...map,
			zones: [
				{
					...(map.zones[0] as WorldMap["zones"][number]),
					seats: [
						{ x: 40, y: 100, facing: "down" },
						{ x: 80, y: 100, facing: "down" },
						{ x: 120, y: 100, facing: "up" },
					],
				},
				{
					...(map.zones[0] as WorldMap["zones"][number]),
					id: "b",
					seats: [
						{ x: 200, y: 100, facing: "down" },
						{ x: 240, y: 100, facing: "down" },
					],
				},
			],
		};
		const desk = (zoneId: string, x: number) => ({ zoneId, x, y: 100 });

		test("a restart puts everyone back at the desk the office stored", () => {
			const team = [
				teammate("b", { desk: desk("a", 120) }),
				teammate("c", { desk: desk("a", 40) }),
			];
			const dealt = layoutWorld({
				map: pods,
				rooms,
				teammates: team,
				handoffs: [],
			});
			expect(dealt.homes.get("b")?.x).toBe(40);

			const restarted = layoutWorld({
				map: pods,
				rooms,
				teammates: team,
				handoffs: [],
				previous: storedDesks(team),
			});
			expect(restarted.homes.get("b")).toEqual({
				zoneId: "a",
				x: 120,
				y: 100,
				facing: "up",
			});
			expect(restarted.homes.get("c")?.x).toBe(40);
			expect(changedDesks(restarted.homes, team)).toEqual([]);
		});

		test("a desk that is gone from the map or outside the room's area falls back to a free seat", () => {
			const team = [
				teammate("b", { desk: desk("a", 999) }),
				teammate("c", { desk: desk("gone", 40) }),
				teammate("d", { desk: desk("a", 40) }),
			];
			const restarted = layoutWorld({
				map: pods,
				rooms,
				teammates: team,
				handoffs: [],
				previous: storedDesks(team),
			});
			expect(team.map((t) => restarted.homes.get(t.id)?.x)).toEqual([
				80, 120, 40,
			]);
			expect(changedDesks(restarted.homes, team).map((d) => d.id)).toEqual([
				"b",
				"c",
			]);

			const roomMoved = layoutWorld({
				map: pods,
				rooms: [{ ...(rooms[0] as Room), place: "b" }],
				teammates: [teammate("d", { desk: desk("a", 40) })],
				handoffs: [],
				previous: storedDesks(team),
			});
			expect(roomMoved.homes.get("d")).toMatchObject({ zoneId: "b", x: 200 });
		});
	});

	test("a room with a place sits there and the others fill the remaining areas", () => {
		const twoPods: WorldMap = {
			...map,
			zones: [
				{ ...(map.zones[0] as WorldMap["zones"][number]), id: "a" },
				{ ...(map.zones[0] as WorldMap["zones"][number]), id: "b" },
			],
		};
		const layout = layoutWorld({
			map: twoPods,
			rooms: [
				{ id: "eng", name: "Engineering", kind: "room" },
				{ id: "ops", name: "Ops", kind: "room", place: "a" },
			] as Room[],
			teammates: [],
			handoffs: [],
		});
		expect(layout.rooms.map((r) => [r.id, r.zone.id])).toEqual([
			["eng", "b"],
			["ops", "a"],
		]);
	});

	test("seats room members in the room's zone; one more than its chairs stands by it", () => {
		const layout = layoutWorld({
			map,
			rooms,
			teammates: [teammate("a"), teammate("b"), teammate("c")],
			handoffs: [],
		});
		expect(layout.targets.get("a")?.zoneId).toBe("a");
		expect(layout.targets.get("b")?.zoneId).toBe("a");
		expect(layout.targets.get("c")).toMatchObject({
			zoneId: "a",
			standing: true,
		});
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

describe("a full area", () => {
	test("more people than chairs stand beside their own area, not in another one", () => {
		const two: WorldMap = {
			image: { w: 640, h: 320 },
			spawn: { x: 600, y: 300 },
			blocked: [],
			zones: [
				{
					id: "pod",
					kind: "team",
					rect: { x: 200, y: 40, w: 96, h: 120 },
					seats: [
						{ x: 224, y: 70, facing: "down" },
						{ x: 272, y: 70, facing: "down" },
					],
				},
				{
					id: "lounge",
					kind: "lounge",
					rect: { x: 480, y: 40, w: 120, h: 120 },
					seats: [{ x: 520, y: 80, facing: "down" }],
				},
			],
		};
		const layout = layoutWorld({
			map: two,
			rooms: [{ id: "eng", name: "Engineering", kind: "room", members: [] }],
			teammates: ["a", "b", "c", "d", "e"].map((id, i) =>
				teammate(id, { joinedAt: i }),
			),
			handoffs: [],
		});
		const standing = ["c", "d", "e"].map((id) => layout.homes.get(id));
		for (const spot of standing) {
			expect(spot).toMatchObject({ zoneId: "pod", standing: true });
			const x = spot?.x ?? 0;
			expect(x < 200 || x > 296).toBe(true);
			expect(Math.min(Math.abs(x - 200), Math.abs(x - 296))).toBeLessThan(49);
		}
		expect(new Set(standing.map((s) => `${s?.x},${s?.y}`)).size).toBe(3);
		expect(layout.homes.get("a")?.standing).toBeUndefined();
	});
});

describe("pathTail and pathHead", () => {
	const from = { x: 0, y: 0 };
	const path = [
		{ x: 100, y: 0 },
		{ x: 100, y: 50 },
	];

	test("the tail starts `length` before the end, part way along a stretch", () => {
		expect(pathTail(from, path, 80)).toEqual({
			start: { x: 70, y: 0 },
			path,
		});
		expect(pathTail(from, path, 30)).toEqual({
			start: { x: 100, y: 20 },
			path: [{ x: 100, y: 50 }],
		});
	});

	test("a path shorter than `length` is kept whole", () => {
		expect(pathTail(from, path, 500)).toEqual({ start: from, path });
		expect(pathHead(from, path, 500)).toEqual(path);
	});

	test("the head stops `length` after the start", () => {
		expect(pathHead(from, path, 120)).toEqual([
			{ x: 100, y: 0 },
			{ x: 100, y: 20 },
		]);
	});
});
