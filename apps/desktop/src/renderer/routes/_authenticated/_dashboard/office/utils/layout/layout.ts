import type { Handoff, Room, Teammate } from "../../types";

export const TILE = 32;

export interface TilePoint {
	x: number;
	y: number;
}

export type Facing = "down" | "left" | "right" | "up";

export interface PlacedProp {
	atlas: string;
	frame: string;
	tile: TilePoint;
	solid: boolean;
}

export interface RoomBox {
	id: string;
	name: string;
	outer: { x: number; y: number; w: number; h: number };
	interior: { x: number; y: number; w: number; h: number };
	door: TilePoint;
}

export interface SeatSpot {
	tile: TilePoint;
	facing: Facing;
	roomId: string;
}

export interface OfficeLayout {
	w: number;
	h: number;
	rooms: RoomBox[];
	props: PlacedProp[];
	/** Floor tile id per map tile, -1 for none. */
	floor: Int8Array;
	/** Wall tile id per map tile, -1 for none. */
	walls: Int8Array;
	blocked: Uint8Array;
	desks: Map<string, SeatSpot>;
	/** Where each teammate should be right now, after hand-offs and huddles. */
	targets: Map<string, SeatSpot>;
}

export const HUDDLE_ROOM_ID = "huddle";

const FLOOR_WOOD = 0;
const FLOOR_CARPET = 1;
const FLOOR_VINYL = 2;

const WALL = {
	topLeft: 1,
	top: 2,
	topRight: 5,
	faceLeft: 6,
	face: 7,
	faceRight: 10,
	left: 11,
	right: 13,
	bottomLeft: 20,
	endBeforeGap: 21,
	endAfterGap: 22,
	bottom: 23,
	bottomRight: 24,
};

const PAD = 1;
const CORRIDOR = 2;
const MAX_ROW_W = 34;
const ROOM_H = 4;
const DESK_STRIDE = 3;

function roomInteriorWidth(memberCount: number): number {
	return Math.max(5, DESK_STRIDE * Math.max(1, memberCount) + 1);
}

export function layoutOffice({
	rooms,
	teammates,
	handoffs,
}: {
	rooms: Room[];
	teammates: Teammate[];
	handoffs: Handoff[];
}): OfficeLayout {
	const byId = new Map(teammates.map((t) => [t.id, t]));
	const homes = new Map<string, string[]>();
	for (const t of teammates) {
		const list = homes.get(t.roomId) ?? [];
		list.push(t.id);
		homes.set(t.roomId, list);
	}

	const boxes: RoomBox[] = [];
	const props: PlacedProp[] = [];
	const desks = new Map<string, SeatSpot>();
	let cursorX = PAD;
	let rowY = PAD;
	let rowH = 0;

	const place = (id: string, name: string, w: number, h: number): RoomBox => {
		const outerW = w + 2;
		const outerH = h + 3;
		if (cursorX > PAD && cursorX + outerW > MAX_ROW_W) {
			cursorX = PAD;
			rowY += rowH + CORRIDOR;
			rowH = 0;
		}
		const box: RoomBox = {
			id,
			name,
			outer: { x: cursorX, y: rowY, w: outerW, h: outerH },
			interior: { x: cursorX + 1, y: rowY + 2, w, h },
			door: { x: cursorX + 1 + Math.floor(w / 2), y: rowY + outerH - 1 },
		};
		boxes.push(box);
		cursorX += outerW + CORRIDOR;
		rowH = Math.max(rowH, outerH);
		return box;
	};

	for (const room of rooms.filter((r) => r.kind === "room")) {
		const members = (homes.get(room.id) ?? []).filter((id) => byId.has(id));
		const box = place(
			room.id,
			room.name,
			roomInteriorWidth(members.length),
			ROOM_H,
		);
		const { x, y, w, h } = box.interior;
		props.push({
			atlas: "storage",
			frame: "filing_cabinet_front",
			tile: { x, y },
			solid: true,
		});
		props.push({
			atlas: "decor",
			frame: "tall_plant_front",
			tile: { x: x + w - 1, y: y + h - 1 },
			solid: true,
		});
		members.forEach((id, index) => {
			const dx = x + 1 + index * DESK_STRIDE;
			props.push({
				atlas: "desks",
				frame: "office_desk_front",
				tile: { x: dx, y },
				solid: true,
			});
			props.push({
				atlas: "tech",
				frame: index % 2 === 0 ? "computer_front" : "laptop_front",
				tile: { x: dx, y },
				solid: true,
			});
			props.push({
				atlas: "desk_items",
				frame: index % 2 === 0 ? "coffee_mug_front" : "paper_stack_front",
				tile: { x: dx + 1, y },
				solid: true,
			});
			props.push({
				atlas: "seating",
				frame: "office_chair_back",
				tile: { x: dx, y: y + 1 },
				solid: false,
			});
			desks.set(id, {
				tile: { x: dx, y: y + 1 },
				facing: "up",
				roomId: room.id,
			});
		});
	}

	const huddle = place(HUDDLE_ROOM_ID, "huddle", 7, 5);
	const hx = huddle.interior.x;
	const hy = huddle.interior.y;
	props.push({
		atlas: "meeting",
		frame: "projector_screen_front",
		tile: { x: hx + 2, y: hy - 1 },
		solid: false,
	});
	props.push({
		atlas: "decor",
		frame: "wall_clock_front",
		tile: { x: hx + 5, y: hy - 1 },
		solid: false,
	});
	props.push({
		atlas: "meeting",
		frame: "conference_table_front",
		tile: { x: hx + 2, y: hy + 1 },
		solid: true,
	});
	props.push({
		atlas: "kitchen",
		frame: "water_cooler_front",
		tile: { x: hx + 6, y: hy },
		solid: true,
	});
	props.push({
		atlas: "meeting",
		frame: "flip_chart_right",
		tile: { x: hx, y: hy },
		solid: true,
	});
	props.push({
		atlas: "decor",
		frame: "office_plant_front",
		tile: { x: hx, y: hy + 4 },
		solid: true,
	});
	const huddleSeats: SeatSpot[] = [];
	for (let i = 0; i < 3; i++) {
		props.push({
			atlas: "seating",
			frame: "office_chair_front",
			tile: { x: hx + 2 + i, y: hy },
			solid: false,
		});
		huddleSeats.push({
			tile: { x: hx + 2 + i, y: hy },
			facing: "down",
			roomId: HUDDLE_ROOM_ID,
		});
	}
	for (let i = 0; i < 3; i++) {
		props.push({
			atlas: "seating",
			frame: "office_chair_back",
			tile: { x: hx + 2 + i, y: hy + 3 },
			solid: false,
		});
		huddleSeats.push({
			tile: { x: hx + 2 + i, y: hy + 3 },
			facing: "up",
			roomId: HUDDLE_ROOM_ID,
		});
	}

	const w = Math.max(...boxes.map((b) => b.outer.x + b.outer.w)) + PAD;
	const h = rowY + rowH + CORRIDOR;
	const floor = new Int8Array(w * h).fill(FLOOR_VINYL);
	const walls = new Int8Array(w * h).fill(-1);
	const blocked = new Uint8Array(w * h);
	const at = (x: number, y: number) => y * w + x;

	for (const box of boxes) {
		const { x, y, w: ow, h: oh } = box.outer;
		const carpet = box.id === HUDDLE_ROOM_ID ? FLOOR_WOOD : FLOOR_CARPET;
		for (let ty = y + 2; ty < y + oh; ty++)
			for (let tx = x; tx < x + ow; tx++) floor[at(tx, ty)] = carpet;
		for (let ty = y; ty < y + 2; ty++)
			for (let tx = x; tx < x + ow; tx++) floor[at(tx, ty)] = -1;
		const right = x + ow - 1;
		const bottom = y + oh - 1;
		walls[at(x, y)] = WALL.topLeft;
		walls[at(right, y)] = WALL.topRight;
		walls[at(x, y + 1)] = WALL.faceLeft;
		walls[at(right, y + 1)] = WALL.faceRight;
		for (let tx = x + 1; tx < right; tx++) {
			walls[at(tx, y)] = WALL.top;
			walls[at(tx, y + 1)] = WALL.face;
			walls[at(tx, bottom)] =
				tx === box.door.x - 1
					? WALL.endBeforeGap
					: tx === box.door.x + 1
						? WALL.endAfterGap
						: tx === box.door.x
							? -1
							: WALL.bottom;
		}
		for (let ty = y + 2; ty < bottom; ty++) {
			walls[at(x, ty)] = WALL.left;
			walls[at(right, ty)] = WALL.right;
		}
		walls[at(x, bottom)] = WALL.bottomLeft;
		walls[at(right, bottom)] = WALL.bottomRight;
	}
	for (let i = 0; i < walls.length; i++) if (walls[i] !== -1) blocked[i] = 1;
	for (const prop of props) {
		if (!prop.solid) continue;
		const size = FOOTPRINTS[prop.frame] ?? [1, 1];
		for (let dy = 0; dy < size[1]; dy++)
			for (let dx = 0; dx < size[0]; dx++)
				blocked[at(prop.tile.x + dx, prop.tile.y + dy)] = 1;
	}

	const targets = new Map<string, SeatSpot>(desks);
	const inHuddle: string[] = [];
	for (const handoff of handoffs) {
		if (handoff.status !== "working") continue;
		const target = byId.get(handoff.toId);
		if (!target || !desks.has(handoff.fromId)) continue;
		if (target.presence !== "focused" && target.presence !== "in-meeting")
			continue;
		for (const id of [handoff.fromId, handoff.toId])
			if (!inHuddle.includes(id)) inHuddle.push(id);
	}
	inHuddle.slice(0, huddleSeats.length).forEach((id, index) => {
		const seat = huddleSeats[index];
		if (seat) targets.set(id, seat);
	});

	return { w, h, rooms: boxes, props, floor, walls, blocked, desks, targets };
}

const FOOTPRINTS: Record<string, [number, number]> = {
	office_desk_front: [2, 1],
	conference_table_front: [3, 2],
	projector_screen_front: [2, 1],
};

export function findPath(
	layout: OfficeLayout,
	from: TilePoint,
	to: TilePoint,
): TilePoint[] {
	const { w, h, blocked } = layout;
	const inside = (p: TilePoint) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
	if (!inside(from) || !inside(to)) return [];
	const key = (p: TilePoint) => p.y * w + p.x;
	const prev = new Int32Array(w * h).fill(-1);
	const seen = new Uint8Array(w * h);
	const queue: TilePoint[] = [from];
	seen[key(from)] = 1;
	const steps = [
		{ x: 1, y: 0 },
		{ x: -1, y: 0 },
		{ x: 0, y: 1 },
		{ x: 0, y: -1 },
	];
	while (queue.length > 0) {
		const current = queue.shift() as TilePoint;
		if (current.x === to.x && current.y === to.y) {
			const path: TilePoint[] = [];
			let k = key(to);
			while (k !== key(from)) {
				path.push({ x: k % w, y: Math.floor(k / w) });
				k = prev[k] ?? -1;
				if (k === -1) return [];
			}
			return path.reverse();
		}
		for (const step of steps) {
			const next = { x: current.x + step.x, y: current.y + step.y };
			if (!inside(next)) continue;
			const nk = key(next);
			if (seen[nk]) continue;
			const isGoal = next.x === to.x && next.y === to.y;
			if (blocked[nk] && !isGoal) continue;
			seen[nk] = 1;
			prev[nk] = key(current);
			queue.push(next);
		}
	}
	return [];
}

export function roomAt(layout: OfficeLayout, tile: TilePoint): RoomBox | null {
	return (
		layout.rooms.find(
			(r) =>
				tile.x >= r.outer.x &&
				tile.x < r.outer.x + r.outer.w &&
				tile.y >= r.outer.y &&
				tile.y < r.outer.y + r.outer.h,
		) ?? null
	);
}
