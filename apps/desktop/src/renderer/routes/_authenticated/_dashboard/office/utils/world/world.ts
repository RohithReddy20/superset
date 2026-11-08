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

/** A seat as the office stores it: its area and position, without the map's facing. */
export interface Desk extends Point {
	zoneId: string;
}

const SPAWN_ZONE = "spawn";

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
	/** Each teammate's own seat, before huddles; pass it back as `previous` to keep seats stable. */
	homes: Map<string, SeatTarget>;
	/** Where each teammate should be right now, after hand-offs and huddles. */
	targets: Map<string, SeatTarget>;
}

/** Where a teammate was put down for a move into `roomId`; they take the free seat nearest it. */
export interface SeatHint {
	roomId: string;
	near: Point;
}

export const CELL = 16;

export function layoutWorld({
	map,
	rooms,
	teammates,
	handoffs,
	previous,
	hints,
}: {
	map: WorldMap;
	rooms: Room[];
	teammates: Teammate[];
	handoffs: Handoff[];
	/** The last layout's homes, or the stored desks: everyone keeps their seat while it still fits their room. */
	previous?: ReadonlyMap<string, Desk>;
	hints?: Map<string, SeatHint>;
}): WorldLayout {
	const byId = new Map(teammates.map((t) => [t.id, t]));
	const teamZones = map.zones.filter((z) => z.kind === "team");
	const spareZones = map.zones.filter(
		(z) => z.kind === "lounge" || z.kind === "booth",
	);
	const huddle = map.zones.find((z) => z.kind === "meeting") ?? null;
	const zoneOrder = [...teamZones, ...spareZones];

	const chatRooms = rooms.filter((r) => r.kind === "room");
	const zoneOf = new Map<string, Zone>();
	for (const room of chatRooms) {
		const zone = map.zones.find((z) => z.id === room.place);
		if (zone && ![...zoneOf.values()].includes(zone)) zoneOf.set(room.id, zone);
	}
	const open = zoneOrder.filter((z) => ![...zoneOf.values()].includes(z));
	const pool = open.length > 0 ? open : zoneOrder;
	let next = 0;
	const placed: PlacedRoom[] = [];
	for (const room of chatRooms) {
		const zone = zoneOf.get(room.id) ?? pool[next++ % Math.max(1, pool.length)];
		if (zone) placed.push({ id: room.id, name: room.name, zone });
	}

	const free = new Map<string, Seat[]>(
		map.zones.map((z) => [z.id, [...z.seats]]),
	);
	const takeSeat = (
		zone: Zone | undefined,
		near: Point | undefined,
	): SeatTarget | null => {
		const pools = [
			zone,
			...spareZones.filter((z) => z !== zone),
			...teamZones.filter((z) => z !== zone),
			...map.zones.filter((z) => z.kind === "meeting"),
		];
		for (const pool of pools) {
			const seats = pool ? free.get(pool.id) : undefined;
			if (!pool || !seats || seats.length === 0) continue;
			const index = near ? nearestIndex(seats, near) : 0;
			const [seat] = seats.splice(index, 1);
			if (seat) return { ...seat, zoneId: pool.id };
		}
		return null;
	};
	const claim = (desk: Desk): SeatTarget | null => {
		const seats = free.get(desk.zoneId);
		const index =
			seats?.findIndex((s) => s.x === desk.x && s.y === desk.y) ?? -1;
		const [seat] = seats && index >= 0 ? seats.splice(index, 1) : [];
		return seat ? { ...seat, zoneId: desk.zoneId } : null;
	};

	const homes = new Map<string, SeatTarget>();
	const byStableOrder = [...teammates].sort((a, b) => a.id.localeCompare(b.id));
	const zoneOfRoom = new Map(placed.map((r) => [r.id, r.zone]));
	for (const t of byStableOrder) {
		const before = previous?.get(t.id);
		const zone = zoneOfRoom.get(t.roomId);
		if (!before || (zone && before.zoneId !== zone.id)) continue;
		const seat = claim(before);
		if (seat) homes.set(t.id, seat);
	}
	const nearOf = (t: Teammate) => {
		const hint = hints?.get(t.id);
		return hint?.roomId === t.roomId ? hint.near : undefined;
	};
	for (const room of placed) {
		for (const t of byStableOrder) {
			if (t.roomId !== room.id || homes.has(t.id)) continue;
			const seat = takeSeat(room.zone, nearOf(t));
			if (seat) homes.set(t.id, seat);
		}
	}
	for (const t of byStableOrder) {
		if (homes.has(t.id)) continue;
		const seat = takeSeat(undefined, nearOf(t));
		homes.set(
			t.id,
			seat ?? { ...map.spawn, facing: "down", zoneId: SPAWN_ZONE },
		);
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
		homes,
		targets,
	};
}

/** The desks the office stored, the `previous` for a floor that has no layout yet. */
export function storedDesks(teammates: Teammate[]): Map<string, Desk> {
	const desks = new Map<string, Desk>();
	for (const t of teammates) if (t.desk) desks.set(t.id, t.desk);
	return desks;
}

/** Homes the office has not stored yet; a spawn point is not a desk. */
export function changedDesks(
	homes: ReadonlyMap<string, SeatTarget>,
	teammates: Teammate[],
): Array<Desk & { id: string }> {
	const changed: Array<Desk & { id: string }> = [];
	for (const t of teammates) {
		const home = homes.get(t.id);
		if (!home || home.zoneId === SPAWN_ZONE) continue;
		const { desk } = t;
		if (desk?.zoneId === home.zoneId && desk.x === home.x && desk.y === home.y)
			continue;
		changed.push({ id: t.id, zoneId: home.zoneId, x: home.x, y: home.y });
	}
	return changed;
}

function nearestIndex(seats: Seat[], near: Point): number {
	let best = 0;
	seats.forEach((seat, index) => {
		const here = Math.hypot(seat.x - near.x, seat.y - near.y);
		const top = seats[best] as Seat;
		if (here < Math.hypot(top.x - near.x, top.y - near.y)) best = index;
	});
	return best;
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

/** A desk area with no room in it yet, where a new room can be made. */
export function emptyTeamZoneAt(
	layout: WorldLayout,
	point: Point,
): Zone | null {
	return (
		layout.map.zones.find(
			(z) =>
				z.kind === "team" &&
				inRect(z.rect, point.x, point.y) &&
				!layout.rooms.some((r) => r.zone.id === z.id),
		) ?? null
	);
}

export function roomAt(layout: WorldLayout, point: Point): PlacedRoom | null {
	return (
		layout.rooms.find((r) => inRect(r.zone.rect, point.x, point.y)) ?? null
	);
}
