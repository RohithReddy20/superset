import type { Handoff, Room, Teammate } from "../../types";

export type Facing = "down" | "left" | "right" | "up";

export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Seat extends Point {
	facing: Facing;
}

export type ZoneKind = "team" | "lounge" | "meeting" | "booth";

export interface Zone {
	id: string;
	label?: string;
	kind: ZoneKind;
	rect: Rect;
	sign?: Point;
	seats: Seat[];
}

export interface WorldMap {
	image: { w: number; h: number };
	zones: Zone[];
	spawn: Point;
	blocked: Rect[];
	doors?: Rect[];
}

export interface SeatTarget extends Seat {
	zoneId: string;
}

export interface PlacedRoom {
	id: string;
	name: string;
	zone: Zone;
}

export interface WorldLayout {
	map: WorldMap;
	cell: number;
	cols: number;
	rows: number;
	blocked: Uint8Array;
	rooms: PlacedRoom[];
	huddle: Zone | null;
	/** Where each teammate should be right now, after hand-offs and huddles. */
	targets: Map<string, SeatTarget>;
}

export const CELL = 16;

export function layoutWorld({
	map,
	rooms,
	teammates,
	handoffs,
}: {
	map: WorldMap;
	rooms: Room[];
	teammates: Teammate[];
	handoffs: Handoff[];
}): WorldLayout {
	const byId = new Map(teammates.map((t) => [t.id, t]));
	const teamZones = map.zones.filter((z) => z.kind === "team");
	const spareZones = map.zones.filter(
		(z) => z.kind === "lounge" || z.kind === "booth",
	);
	const huddle = map.zones.find((z) => z.kind === "meeting") ?? null;
	const zoneOrder = [...teamZones, ...spareZones];

	const placed: PlacedRoom[] = [];
	rooms
		.filter((r) => r.kind === "room")
		.forEach((room, index) => {
			const zone = zoneOrder[index % Math.max(1, zoneOrder.length)];
			if (zone) placed.push({ id: room.id, name: room.name, zone });
		});

	const free = new Map<string, Seat[]>(
		map.zones.map((z) => [z.id, [...z.seats]]),
	);
	const takeSeat = (zone: Zone | undefined): SeatTarget | null => {
		const pools = [
			zone,
			...spareZones.filter((z) => z !== zone),
			...teamZones.filter((z) => z !== zone),
			...map.zones.filter((z) => z.kind === "meeting"),
		];
		for (const pool of pools) {
			const seat = pool ? free.get(pool.id)?.shift() : undefined;
			if (seat && pool) return { ...seat, zoneId: pool.id };
		}
		return null;
	};

	const homes = new Map<string, SeatTarget>();
	const byStableOrder = [...teammates].sort((a, b) => a.id.localeCompare(b.id));
	for (const room of placed) {
		for (const t of byStableOrder) {
			if (t.roomId !== room.id) continue;
			const seat = takeSeat(room.zone);
			if (seat) homes.set(t.id, seat);
		}
	}
	for (const t of byStableOrder) {
		if (homes.has(t.id)) continue;
		const seat = takeSeat(undefined);
		homes.set(t.id, seat ?? { ...map.spawn, facing: "down", zoneId: "spawn" });
	}

	const targets = new Map(homes);
	if (huddle) {
		const inHuddle: string[] = [];
		for (const handoff of handoffs) {
			if (handoff.status !== "working") continue;
			const target = byId.get(handoff.toId);
			if (!target || !byId.has(handoff.fromId)) continue;
			if (target.presence !== "focused" && target.presence !== "in-meeting")
				continue;
			for (const id of [handoff.fromId, handoff.toId])
				if (!inHuddle.includes(id)) inHuddle.push(id);
		}
		const huddleSeats = [...huddle.seats];
		for (const id of inHuddle) {
			const seat = huddleSeats.shift();
			if (seat) targets.set(id, { ...seat, zoneId: huddle.id });
		}
	}

	const cols = Math.ceil(map.image.w / CELL);
	const rows = Math.ceil(map.image.h / CELL);
	const blocked = new Uint8Array(cols * rows);
	const doors = map.doors ?? [];
	for (let cy = 0; cy < rows; cy++) {
		for (let cx = 0; cx < cols; cx++) {
			const px = cx * CELL + CELL / 2;
			const py = cy * CELL + CELL / 2;
			if (doors.some((d) => inRect(d, px, py))) continue;
			if (map.blocked.some((b) => inRect(b, px, py)))
				blocked[cy * cols + cx] = 1;
		}
	}

	return {
		map,
		cell: CELL,
		cols,
		rows,
		blocked,
		rooms: placed,
		huddle,
		targets,
	};
}

function inRect(rect: Rect, x: number, y: number): boolean {
	return (
		x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
	);
}

export function cellOf(point: Point): Point {
	return { x: Math.floor(point.x / CELL), y: Math.floor(point.y / CELL) };
}

export function isWalkable(layout: WorldLayout, point: Point): boolean {
	const c = cellOf(point);
	if (c.x < 0 || c.y < 0 || c.x >= layout.cols || c.y >= layout.rows)
		return false;
	return layout.blocked[c.y * layout.cols + c.x] === 0;
}

/** Breadth-first path over walk cells; the last point is exactly `to`. */
export function findPath(layout: WorldLayout, from: Point, to: Point): Point[] {
	const { cols, rows, blocked } = layout;
	const start = cellOf(from);
	const goal = cellOf(to);
	const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows;
	if (!inside(start) || !inside(goal)) return [];
	const key = (p: Point) => p.y * cols + p.x;
	if (key(start) === key(goal)) return [to];
	const prev = new Int32Array(cols * rows).fill(-1);
	const seen = new Uint8Array(cols * rows);
	const queue: Point[] = [start];
	seen[key(start)] = 1;
	const steps = [
		{ x: 1, y: 0 },
		{ x: -1, y: 0 },
		{ x: 0, y: 1 },
		{ x: 0, y: -1 },
	];
	let head = 0;
	while (head < queue.length) {
		const current = queue[head++] as Point;
		if (current.x === goal.x && current.y === goal.y) {
			const cells: Point[] = [];
			let k = key(goal);
			while (k !== key(start)) {
				cells.push({ x: k % cols, y: Math.floor(k / cols) });
				k = prev[k] ?? -1;
				if (k === -1) return [];
			}
			cells.reverse();
			const path = cells
				.slice(0, -1)
				.map((c) => ({ x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL / 2 }));
			path.push(to);
			return smoothPath(layout, from, path);
		}
		for (const step of steps) {
			const next = { x: current.x + step.x, y: current.y + step.y };
			if (!inside(next)) continue;
			const nk = key(next);
			if (seen[nk]) continue;
			const isGoal = next.x === goal.x && next.y === goal.y;
			if (blocked[nk] && !isGoal) continue;
			seen[nk] = 1;
			prev[nk] = key(current);
			queue.push(next);
		}
	}
	return [];
}

/** Drops waypoints while a straight line to the next one stays on walkable cells. */
function smoothPath(layout: WorldLayout, from: Point, path: Point[]): Point[] {
	const result: Point[] = [];
	let anchor = from;
	let index = 0;
	while (index < path.length) {
		let furthest = index;
		for (let probe = index + 1; probe < path.length; probe++) {
			if (clearLine(layout, anchor, path[probe] as Point)) furthest = probe;
			else break;
		}
		const next = path[furthest] as Point;
		result.push(next);
		anchor = next;
		index = furthest + 1;
	}
	return result;
}

function clearLine(layout: WorldLayout, a: Point, b: Point): boolean {
	const distance = Math.hypot(b.x - a.x, b.y - a.y);
	const samples = Math.max(1, Math.ceil(distance / (CELL / 2)));
	for (let i = 1; i < samples; i++) {
		const t = i / samples;
		const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
		if (!isWalkable(layout, p)) return false;
	}
	return true;
}

export function roomAt(layout: WorldLayout, point: Point): PlacedRoom | null {
	return (
		layout.rooms.find((r) => inRect(r.zone.rect, point.x, point.y)) ?? null
	);
}
