/**
 * Exports the office tileset for Tiled and (with --map) writes the starting office map.
 *
 *   bun run scripts/office-tileset.ts          # refresh floor-walls.png, props/*.png and the tilesets inside office.json
 *   bun run scripts/office-tileset.ts --map    # also rebuild office.json layers from the layout below (discards Tiled edits)
 *   bun run scripts/office-tileset.ts --preview out.png   # also render the map with a few teammates, 2x
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
	capTileName,
	drawFigure,
	EDGE,
	type FloorMaterial,
	FRAME,
	faceTileName,
	floorTileName,
	isFloorTile,
	PROP_NAMES,
	PROPS,
	Sprite,
	TILE,
	TILE_NAMES,
	TILES,
	tileStrip,
} from "../src/renderer/routes/_authenticated/_dashboard/office/tileset";

const OUT = join(
	import.meta.dir,
	"../src/renderer/routes/_authenticated/_dashboard/office/components/OfficeFloor/assets/world",
);
const T = TILE;
const COLS = 52;
const ROWS = 34;

/* ---------- png ---------- */
const CRC = new Uint32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(buf: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of buf) c = (CRC[(c ^ b) & 255] ?? 0) ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, data.length);
	out.set(new TextEncoder().encode(type), 4);
	out.set(data, 8);
	dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}
export function encodePng(s: Sprite): Uint8Array {
	const raw = new Uint8Array((s.w * 4 + 1) * s.h);
	for (let y = 0; y < s.h; y++) {
		raw[y * (s.w * 4 + 1)] = 0;
		raw.set(
			s.data.subarray(y * s.w * 4, (y + 1) * s.w * 4),
			y * (s.w * 4 + 1) + 1,
		);
	}
	const ihdr = new Uint8Array(13);
	const dv = new DataView(ihdr.buffer);
	dv.setUint32(0, s.w);
	dv.setUint32(4, s.h);
	ihdr.set([8, 6, 0, 0, 0], 8);
	const parts = [
		new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", ihdr),
		chunk("IDAT", new Uint8Array(deflateSync(raw))),
		chunk("IEND", new Uint8Array(0)),
	];
	const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		png.set(p, o);
		o += p.length;
	}
	return png;
}

/* ---------- layout ---------- */
type Facing = "down" | "up" | "left" | "right";
interface Place {
	name: string;
	cx: number;
	base: number;
}
interface SeatSpec {
	x: number;
	y: number;
	facing: Facing;
	zone: string;
}
interface ZoneSpec {
	id: string;
	kind: "team" | "meeting" | "lounge" | "booth";
	x: number;
	y: number;
	w: number;
	h: number;
	label?: string;
	sign?: { x: number; y: number };
}

const places: Place[] = [];
const seats: SeatSpec[] = [];
const zones: ZoneSpec[] = [];
const walls = new Uint8Array(COLS * ROWS);
const floors: FloorMaterial[] = new Array(COLS * ROWS).fill("concrete");
const spawn = { x: 25.5 * T, y: 21.5 * T };

const size = (name: string) => {
	const s = PROPS[name]?.draw();
	return { w: s?.w ?? 0, h: s?.h ?? 0 };
};
const put = (name: string, cx: number, base: number) =>
	places.push({ name, cx: Math.round(cx), base: Math.round(base) });
const seat = (x: number, y: number, facing: Facing, zone: string) =>
	seats.push({ x: Math.round(x), y: Math.round(y), facing, zone });

/** Sets a block of cells, columns c0..c1 and rows r0..r1 inclusive. */
function cells(
	c0: number,
	r0: number,
	c1: number,
	r1: number,
	set: (i: number) => void,
) {
	for (let r = r0; r <= r1; r++)
		for (let c = c0; c <= c1; c++) set(r * COLS + c);
}
const wall = (c0: number, r0: number, c1: number, r1: number) =>
	cells(c0, r0, c1, r1, (i) => {
		walls[i] = 1;
	});
const doorway = (
	c0: number,
	r0: number,
	c1: number,
	r1: number,
	m: FloorMaterial,
) =>
	cells(c0, r0, c1, r1, (i) => {
		walls[i] = 0;
		floors[i] = m;
	});
const paint = (
	c0: number,
	r0: number,
	c1: number,
	r1: number,
	m: FloorMaterial,
) =>
	cells(c0, r0, c1, r1, (i) => {
		floors[i] = m;
	});

/** An area covering tiles c0..c1, r0..r1, with its name shown at `sign` (tile units). */
function area(
	id: string,
	kind: ZoneSpec["kind"],
	[c0, r0, c1, r1]: [number, number, number, number],
	label: string,
	sign: [number, number],
) {
	zones.push({
		id,
		kind,
		x: c0 * T,
		y: r0 * T,
		w: (c1 - c0 + 1) * T,
		h: (r1 - r0 + 1) * T,
		label,
		sign: { x: sign[0] * T, y: sign[1] * T },
	});
}

function pod(id: string, cx: number, top: number) {
	for (let i = 0; i < 2; i++) {
		const x = (cx - 2 + 2 * i) * T + T;
		put("chair-front", x, top * T - 6);
		put("desk-back", x, top * T + 26);
		put("desk-front", x, top * T + 68);
		put("chair-back", x, top * T + 94);
		seat(x, top * T - 8, "down", id);
		seat(x, top * T + 88, "up", id);
	}
	zones.push({
		id,
		kind: "team",
		x: (cx - 2) * T,
		y: top * T - 40,
		w: 4 * T,
		h: 172,
	});
}

/** A table for six with its rug; `base` is the table's bottom edge. */
function tableForSix(zone: string, cx: number, base: number, rug: string) {
	put(rug, cx, base + 51);
	put("meeting-table", cx, base);
	for (const dx of [-44, 0, 44]) {
		put("chair-front", cx + dx, base - 38);
		put("chair-back", cx + dx, base + 22);
		seat(cx + dx, base - 46, "down", zone);
		seat(cx + dx, base + 16, "up", zone);
	}
}

/** A table for four; `base` is the table's bottom edge. */
function tableForFour(zone: string, cx: number, base: number) {
	put("dining-table", cx, base);
	for (const dx of [-16, 16]) {
		put("chair-front", cx + dx, base - 26);
		put("chair-back", cx + dx, base + 22);
		seat(cx + dx, base - 34, "down", zone);
		seat(cx + dx, base + 16, "up", zone);
	}
}

function shell() {
	wall(0, 0, COLS - 1, 1);
	wall(0, 0, 0, ROWS - 1);
	wall(COLS - 1, 0, COLS - 1, ROWS - 1);
	wall(0, ROWS - 1, COLS - 1, ROWS - 1);
	wall(1, 18, 50, 19);
	wall(32, 2, 32, 17);
	wall(33, 10, 50, 11);
	wall(42, 2, 42, 9);
	wall(16, 20, 16, 32);
	wall(36, 20, 36, 32);

	paint(33, 2, 50, 9, "carpet");
	paint(33, 12, 50, 17, "wood");
	paint(1, 20, 15, 32, "tile");
	paint(17, 20, 35, 32, "wood");
	paint(37, 20, 50, 32, "carpet");

	doorway(9, 18, 10, 19, "tile");
	doorway(24, 18, 25, 19, "wood");
	doorway(42, 18, 43, 19, "carpet");
	doorway(32, 14, 32, 15, "wood");
	doorway(34, 10, 35, 11, "carpet");
	doorway(44, 10, 45, 11, "carpet");
	doorway(16, 25, 16, 26, "wood");
	doorway(36, 25, 36, 26, "carpet");
}

function engineering() {
	for (const cx of [5, 12, 26, 29.5]) put("window", cx * T, 2 * T - 4);
	put("poster", 15.5 * T, 2 * T - 6);
	put("logo-bracket", 19 * T, 2 * T - 4);
	put("clock", 19 * T, T + 20);
	put("poster", 22.5 * T, 2 * T - 6);
	put("bookshelf", 2.2 * T, 4 * T);
	put("printer", 8.3 * T, 3.6 * T);
	put("water-cooler", 9.7 * T, 4 * T);
	put("plant-tall", 14.4 * T, 4 * T);
	put("bookshelf", 21.9 * T, 4 * T);
	put("plant-tall", 23.6 * T, 4 * T);
	put("plant-tall", 28.6 * T, 4 * T);
	put("bookshelf", 30.4 * T, 4 * T);
	let n = 1;
	for (const top of [5.2, 11])
		for (const cx of [5, 12, 19, 26]) pod(`pod-${n++}`, cx, top);
	put("whiteboard", 15.5 * T, 16.6 * T);
	put("plant-small", 1.6 * T, 17.8 * T);
	put("plant-small", 30.8 * T, 17.8 * T);
}

function meetingRooms() {
	put("tv-screen", 37.5 * T, 2 * T - 4);
	put("plant-tall", 33.6 * T, 3.6 * T);
	put("plant-tall", 41.4 * T, 3.6 * T);
	tableForSix("huddle", 37.5 * T, 6.4 * T, "rug-meeting");
	area("huddle", "meeting", [33, 2, 41, 9], "Huddle room", [37.5, 9.5]);

	put("tv-screen", 47 * T, 2 * T - 4);
	put("plant-small", 43.6 * T, 3.6 * T);
	put("plant-small", 50.4 * T, 3.6 * T);
	tableForSix("meeting", 47 * T, 6.4 * T, "rug-meeting");
	area("meeting", "meeting", [43, 2, 50, 9], "Meeting room", [47, 9.5]);
}

function hall() {
	for (const cx of [38, 39.5, 41]) {
		put("phone-booth", cx * T, 13.9 * T);
		seat(cx * T, 13.9 * T + 2, "up", "booths");
	}
	area("booths", "booth", [37, 12, 41, 14], "Phone booths", [39.5, 15]);

	put("bookshelf", 48.5 * T, 13.6 * T);
	put("floor-lamp", 50.5 * T, 15.6 * T);
	put("plant-small", 46.4 * T, 13.4 * T);
	for (const cx of [47.4, 49.6]) {
		put("armchair-front", cx * T, 16 * T);
		seat(cx * T, 16 * T - 10, "down", "library");
	}
	area("library", "lounge", [46, 12, 50, 17], "Library", [48.5, 17.4]);
}

function kitchen() {
	put("kitchen-counter", 4.5 * T, 22 * T);
	for (const cx of [3.6, 4.5, 5.4]) {
		put("stool", cx * T, 22.8 * T);
		seat(cx * T, 22.8 * T - 4, "up", "kitchen");
	}
	put("poster", 7.4 * T, 20 * T - 6);
	put("fridge", 12.6 * T, 22 * T);
	put("water-cooler", 14.3 * T, 21.8 * T);
	put("plant-tall", 1.6 * T, 21.6 * T);
	for (const base of [26.2, 30.6])
		for (const cx of [4.5, 11]) tableForFour("kitchen", cx * T, base * T);
	put("plant-small", 14.4 * T, 32.6 * T);
	area("kitchen", "lounge", [1, 20, 15, 32], "Kitchen", [7.75, 24.2]);
}

function lobby() {
	put("bookshelf", 20.5 * T, 21.6 * T);
	put("plant-tall", 22.3 * T, 21.4 * T);
	put("plant-tall", 27.6 * T, 21.4 * T);
	put("bookshelf", 30 * T, 21.6 * T);
	put("logo-bracket", 33 * T, 20 * T - 4);
	put("clock", 33 * T, 19 * T + 20);
	put("plant-tall", 34.6 * T, 21.6 * T);

	put("rug-lobby", 26 * T, 28.6 * T);
	put("sofa", 26 * T, 25.2 * T);
	for (const dx of [-26, 0, 26])
		seat(26 * T + dx, 25.2 * T - 12, "down", "lounge");
	put("coffee-table", 26 * T, 26.9 * T);
	for (const cx of [24.6, 27.4]) {
		put("armchair-back", cx * T, 28.4 * T);
		seat(cx * T, 28.4 * T - 8, "up", "lounge");
	}
	put("floor-lamp", 23.6 * T, 25 * T);
	put("floor-lamp", 28.4 * T, 25 * T);
	put("ping-pong", 31.5 * T, 31.6 * T);
	put("plant-small", 17.6 * T, 32.6 * T);
	area("lounge", "lounge", [17, 20, 35, 32], "Lounge", [26, 30.4]);
}

function studio() {
	put("poster", 38.4 * T, 20 * T - 6);
	put("plant-tall", 37.6 * T, 21.4 * T);
	put("whiteboard", 50 * T, 21.6 * T);
	pod("studio-1", 40, 23.2);
	pod("studio-2", 47, 23.2);
	tableForSix("review", 44 * T, 30.2 * T, "rug-studio");
	area("review", "meeting", [38, 28, 50, 32], "Review table", [44, 27.6]);
	put("plant-small", 37.6 * T, 32.6 * T);
	put("plant-small", 50.4 * T, 32.6 * T);
}

function layout() {
	shell();
	engineering();
	meetingRooms();
	hall();
	kitchen();
	lobby();
	studio();
}

const isWall = (c: number, r: number) =>
	c < 0 || r < 0 || c >= COLS || r >= ROWS || walls[r * COLS + c] === 1;
const isFace = (c: number, r: number) =>
	r < ROWS && isWall(c, r) && !isWall(c, r + 1);
const isCap = (c: number, r: number) => isWall(c, r) && !isFace(c, r);

function floorName(c: number, r: number): string {
	if (isFace(c, r))
		return faceTileName(
			(isFace(c + 1, r) ? 0 : EDGE.e) | (isFace(c - 1, r) ? 0 : EDGE.w),
		);
	if (isCap(c, r))
		return capTileName(
			(isCap(c, r - 1) ? 0 : EDGE.n) |
				(isCap(c + 1, r) ? 0 : EDGE.e) |
				(isCap(c, r + 1) ? 0 : EDGE.s) |
				(isCap(c - 1, r) ? 0 : EDGE.w),
		);
	const material = floors[r * COLS + c] ?? "concrete";
	const pattern = [0, 0, 1, 0, 2, 0, 0][(c * 7 + r * 3) % 7] ?? 0;
	return floorTileName(
		material,
		material === "concrete" ? pattern : c * 5 + r * 3,
	);
}

/* ---------- tiled json ---------- */
const prop = (name: string, value: unknown, type = typeof value) => ({
	name,
	type,
	value,
});

function tilesets() {
	const floor = {
		firstgid: 1,
		name: "floor-walls",
		image: "floor-walls.png",
		imagewidth: T * TILE_NAMES.length,
		imageheight: T,
		tilewidth: T,
		tileheight: T,
		tilecount: TILE_NAMES.length,
		columns: TILE_NAMES.length,
		margin: 0,
		spacing: 0,
		tiles: TILE_NAMES.map((name, id) => ({
			id,
			properties: [
				prop("name", name),
				prop("blocked", !isFloorTile(name), "bool"),
			],
		})),
	};
	const sizes = PROP_NAMES.map(size);
	const props = {
		firstgid: 1 + TILE_NAMES.length,
		name: "props",
		tilewidth: Math.max(...sizes.map((s) => s.w)),
		tileheight: Math.max(...sizes.map((s) => s.h)),
		tilecount: PROP_NAMES.length,
		columns: 0,
		margin: 0,
		spacing: 0,
		objectalignment: "bottomleft",
		grid: { orientation: "orthogonal", width: 1, height: 1 },
		tiles: PROP_NAMES.map((name, id) => ({
			id,
			image: `props/${name}.png`,
			imagewidth: sizes[id]?.w ?? 0,
			imageheight: sizes[id]?.h ?? 0,
			properties: [
				prop("name", name),
				prop("footprint", PROPS[name]?.footprint ?? 0, "int"),
			],
		})),
	};
	return [floor, props];
}

function layers() {
	layout();
	const gidOfProp = (name: string) =>
		1 + TILE_NAMES.length + PROP_NAMES.indexOf(name);
	let nextId = 1;
	const data: number[] = [];
	for (let r = 0; r < ROWS; r++)
		for (let c = 0; c < COLS; c++)
			data.push(1 + TILE_NAMES.indexOf(floorName(c, r)));
	const sorted = [...places].sort((a, b) => a.base - b.base);
	return [
		{
			id: 1,
			name: "floor",
			type: "tilelayer",
			width: COLS,
			height: ROWS,
			x: 0,
			y: 0,
			opacity: 1,
			visible: true,
			data,
		},
		{
			id: 2,
			name: "props",
			type: "objectgroup",
			draworder: "topdown",
			opacity: 1,
			visible: true,
			x: 0,
			y: 0,
			objects: sorted.map((p) => {
				const { w, h } = size(p.name);
				return {
					id: nextId++,
					name: p.name,
					gid: gidOfProp(p.name),
					x: Math.round(p.cx - w / 2),
					y: Math.round(p.base),
					width: w,
					height: h,
					rotation: 0,
					visible: true,
				};
			}),
		},
		{
			id: 3,
			name: "zones",
			type: "objectgroup",
			draworder: "topdown",
			opacity: 1,
			visible: true,
			x: 0,
			y: 0,
			objects: zones.map((z) => ({
				id: nextId++,
				name: z.id,
				class: z.kind,
				type: z.kind,
				x: Math.round(z.x),
				y: Math.round(z.y),
				width: Math.round(z.w),
				height: Math.round(z.h),
				rotation: 0,
				visible: true,
				properties: [
					...(z.label ? [prop("label", z.label)] : []),
					...(z.sign
						? [
								prop("signX", Math.round(z.sign.x), "int"),
								prop("signY", Math.round(z.sign.y), "int"),
							]
						: []),
				],
			})),
		},
		{
			id: 4,
			name: "seats",
			type: "objectgroup",
			draworder: "index",
			opacity: 1,
			visible: true,
			x: 0,
			y: 0,
			objects: seats.map((s) => ({
				id: nextId++,
				name: s.zone,
				point: true,
				x: Math.round(s.x),
				y: Math.round(s.y),
				width: 0,
				height: 0,
				rotation: 0,
				visible: true,
				properties: [prop("zone", s.zone), prop("facing", s.facing)],
			})),
		},
		{
			id: 5,
			name: "spawn",
			type: "objectgroup",
			draworder: "index",
			opacity: 1,
			visible: true,
			x: 0,
			y: 0,
			objects: [
				{
					id: nextId++,
					name: "spawn",
					point: true,
					x: Math.round(spawn.x),
					y: Math.round(spawn.y),
					width: 0,
					height: 0,
					rotation: 0,
					visible: true,
				},
			],
		},
	];
}

/* ---------- preview ---------- */
function preview(map: {
	layers: {
		name: string;
		data?: number[];
		objects?: {
			gid?: number;
			x: number;
			y: number;
			width?: number;
			height?: number;
		}[];
	}[];
}): Sprite {
	const room = new Sprite(COLS * T, ROWS * T);
	const tiles = Object.fromEntries(TILE_NAMES.map((n) => [n, TILES[n]?.()]));
	map.layers
		.find((l) => l.name === "floor")
		?.data?.forEach((gid, i) => {
			const t = tiles[TILE_NAMES[gid - 1] ?? ""];
			if (t) room.blit(t, (i % COLS) * T, Math.floor(i / COLS) * T);
		});
	const objs = map.layers.find((l) => l.name === "props")?.objects ?? [];
	const items: { order: number; draw: () => void }[] = [];
	for (const o of objs) {
		const name = PROP_NAMES[(o.gid ?? 0) - 1 - TILE_NAMES.length] ?? "";
		const p = PROPS[name];
		if (!p) continue;
		items.push({
			order: p.flat ? -1e6 + o.y : o.y,
			draw: () => room.blit(p.draw(), o.x, o.y - (o.height ?? 0)),
		});
	}
	const outfitA = {
		skin: "#6f4a30",
		hair: "#1a1a1a",
		hairRows: 3,
		long: false,
		top: "#5f5a56",
		trousers: "#24201f",
		shoes: "#a8a5a3",
		accent: "#b0623a",
	};
	const outfitB = {
		skin: "#e0b48f",
		hair: "#3b2f29",
		hairRows: 4,
		long: true,
		top: "#c9c6c3",
		trousers: "#2f2c2a",
		shoes: "#1b1817",
		accent: "#3f8f8a",
	};
	const sit = (
		o: typeof outfitA,
		view: "front" | "back",
		x: number,
		y: number,
		order: number,
	) =>
		items.push({
			order,
			draw: () =>
				room.blit(
					drawFigure(o, { view, seated: true }),
					x - FRAME.feetX,
					y - FRAME.feetY,
				),
		});
	const seatIn = (zone: string, i: number) =>
		seats.filter((s) => s.zone === zone)[i] as SeatSpec;
	for (const [zone, i, o] of [
		["pod-1", 0, outfitA],
		["pod-1", 1, outfitB],
		["pod-2", 3, outfitB],
		["huddle", 0, outfitA],
		["huddle", 4, outfitB],
		["kitchen", 5, outfitA],
		["lounge", 1, outfitB],
		["lounge", 3, outfitA],
		["library", 0, outfitB],
		["booths", 1, outfitA],
		["studio-1", 2, outfitB],
	] as const) {
		const s = seatIn(zone, i);
		sit(o, s.facing === "up" ? "back" : "front", s.x, s.y, s.y + 8);
	}
	items.push({
		order: 15 * T,
		draw: () =>
			room.blit(
				drawFigure(outfitB, { view: "side", step: 1 }),
				33.5 * T - FRAME.feetX,
				15 * T - FRAME.feetY,
			),
	});
	for (const item of items.sort((a, b) => a.order - b.order)) item.draw();
	const k = 2;
	const big = new Sprite(room.w * k, room.h * k);
	for (let y = 0; y < big.h; y++)
		for (let x = 0; x < big.w; x++)
			big.data.set(
				room.data.subarray(
					(Math.floor(y / k) * room.w + Math.floor(x / k)) * 4,
					(Math.floor(y / k) * room.w + Math.floor(x / k)) * 4 + 4,
				),
				(y * big.w + x) * 4,
			);
	return big;
}

/* ---------- main ---------- */
const args = process.argv.slice(2);
mkdirSync(join(OUT, "props"), { recursive: true });
writeFileSync(join(OUT, "floor-walls.png"), encodePng(tileStrip()));
for (const name of PROP_NAMES)
	writeFileSync(
		join(OUT, "props", `${name}.png`),
		encodePng(PROPS[name]?.draw() ?? new Sprite(1, 1)),
	);

const mapPath = join(OUT, "office.json");
const existing = existsSync(mapPath)
	? JSON.parse(readFileSync(mapPath, "utf8"))
	: null;
const rebuild = !existing || args.includes("--map");
const map = {
	...(existing ?? {}),
	type: "map",
	version: "1.10",
	tiledversion: "1.11.0",
	orientation: "orthogonal",
	renderorder: "right-down",
	infinite: false,
	width: rebuild ? COLS : existing.width,
	height: rebuild ? ROWS : existing.height,
	tilewidth: T,
	tileheight: T,
	compressionlevel: -1,
	tilesets: tilesets(),
	layers: rebuild ? layers() : existing.layers,
	nextlayerid: 6,
	nextobjectid: 1000,
};
writeFileSync(mapPath, `${JSON.stringify(map, null, "\t")}\n`);
const previewIndex = args.indexOf("--preview");
if (previewIndex >= 0) {
	if (!rebuild) layout();
	writeFileSync(
		args[previewIndex + 1] ?? "office-preview.png",
		encodePng(preview(map)),
	);
}
console.log(
	`wrote ${PROP_NAMES.length} props, ${TILE_NAMES.length} tiles, map ${map.width}x${map.height}`,
);
