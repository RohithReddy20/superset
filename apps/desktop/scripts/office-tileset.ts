/**
 * Exports the office tileset for Tiled and (with --map) writes the starting office map.
 *
 *   bun run scripts/office-tileset.ts          # refresh floor-walls.png, props/*.png and the tilesets inside office.json
 *   bun run scripts/office-tileset.ts --map    # also rebuild office.json layers from the layout below (discards Tiled edits)
 *   bun run scripts/office-tileset.ts --preview out.png   # also render the map with a few teammates, 3x
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
	drawFigure,
	FRAME,
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
const COLS = 28;
const ROWS = 18;

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
	w?: number;
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
}

const places: Place[] = [];
const seats: SeatSpec[] = [];
const zones: ZoneSpec[] = [];
const size = (name: string) => {
	const s = PROPS[name]?.draw();
	return { w: s?.w ?? 0, h: s?.h ?? 0 };
};
const put = (name: string, cx: number, base: number) =>
	places.push({ name, cx: Math.round(cx), base: Math.round(base) });
const seat = (x: number, y: number, facing: Facing, zone: string) =>
	seats.push({ x: Math.round(x), y: Math.round(y), facing, zone });

function pod(id: string, cx: number, top: number) {
	for (let i = 0; i < 2; i++) {
		const x = (cx - 2 + 2 * i) * T + T;
		put("chair-front", x, top * T - 6);
		put("desk-back", x, top * T + 26);
		put("desk-front", x, top * T + 68);
		put("chair-back", x, top * T + 94);
		seats.push({ x, y: top * T - 8, facing: "down", zone: id });
		seats.push({ x, y: top * T + 88, facing: "up", zone: id });
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

function layout() {
	put("window", 5 * T, 2 * T - 4);
	put("window", 10 * T, 2 * T - 4);
	put("window", 23 * T, 2 * T - 4);
	put("logo-bracket", 14 * T, 2 * T - 4);
	put("clock", 14 * T, T + 20);
	put("poster", 16.5 * T, 2 * T - 6);
	put("door", 18.5 * T, 2 * T - 2);
	put("bookshelf", 2 * T, 4 * T);
	put("plant-tall", 3.6 * T, 4 * T);
	put("printer", 7.5 * T, 3.6 * T);
	put("water-cooler", 9 * T, 4 * T);
	put("plant-tall", 26.4 * T, 4 * T);

	pod("pod-a", 4, 5.2);
	pod("pod-b", 9, 5.2);
	pod("pod-c", 4, 10.6);
	pod("pod-d", 9, 10.6);

	put("rug-meeting", 22 * T, 10.2 * T);
	put("whiteboard", 22 * T, 4.2 * T);
	put("meeting-table", 22 * T, 8.6 * T);
	for (const dx of [-44, 0, 44]) {
		put("chair-front", 22 * T + dx, 8.6 * T - 38);
		put("chair-back", 22 * T + dx, 8.6 * T + 22);
		seat(22 * T + dx, 8.6 * T - 46, "down", "meeting");
		seat(22 * T + dx, 8.6 * T + 16, "up", "meeting");
	}
	zones.push({
		id: "meeting",
		kind: "meeting",
		x: 22 * T - 88,
		y: 10.2 * T - 100,
		w: 176,
		h: 100,
	});

	put("kitchen-counter", 15 * T, 4 * T);
	for (let i = 0; i < 3; i++) {
		const x = (13.6 + i * 0.9) * T;
		put("stool", x, 4.8 * T);
		seats.push({ x, y: 4.8 * T - 4, facing: "up", zone: "kitchen" });
	}
	zones.push({
		id: "kitchen",
		kind: "lounge",
		x: 12.5 * T,
		y: 2.5 * T,
		w: 5 * T,
		h: 3 * T,
	});

	put("rug-lounge", 20 * T, 15.2 * T);
	put("sofa", 20 * T, 13.3 * T);
	put("coffee-table", 20 * T, 14.7 * T);
	put("floor-lamp", 17.2 * T, 13.3 * T);
	put("plant-small", 23.3 * T, 13.3 * T);
	put("plant-small", 16.8 * T, 15.6 * T);
	for (const dx of [-26, 0, 26])
		seat(20 * T + dx, 13.3 * T - 12, "down", "lounge");
	zones.push({
		id: "lounge",
		kind: "lounge",
		x: 20 * T - 64,
		y: 15.2 * T - 80,
		w: 128,
		h: 80,
	});

	for (const cx of [25.2, 26.6]) {
		put("phone-booth", cx * T, 15.5 * T);
		seat(cx * T, 15.5 * T + 2, "up", "booths");
	}
	zones.push({
		id: "booths",
		kind: "booth",
		x: 24.5 * T,
		y: 15.5 * T - 72,
		w: 2.8 * T,
		h: 80,
	});
}

function floorName(c: number, r: number): string {
	const L = c === 0;
	const R = c === COLS - 1;
	if (r === 0) return L ? "corner-tl" : R ? "corner-tr" : "wall-cap";
	if (r === 1) return L ? "face-left" : R ? "face-right" : "wall-face";
	if (r === ROWS - 1) return L ? "corner-bl" : R ? "corner-br" : "front";
	if (L) return "side-left";
	if (R) return "side-right";
	return (
		[
			"floor-0",
			"floor-0",
			"floor-1",
			"floor-0",
			"floor-2",
			"floor-0",
			"floor-0",
		][(c * 7 + r * 3) % 7] ?? "floor-0"
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
					x: Math.round(18.5 * T),
					y: Math.round(3.2 * T),
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
	const seatAt = (i: number) => seats[i] as SeatSpec;
	for (const [i, o] of [
		[0, outfitA],
		[1, outfitB],
		[6, outfitB],
		[17, outfitA],
		[16, outfitB],
		[23, outfitA],
	] as const) {
		const s = seatAt(i);
		sit(o, s.facing === "up" ? "back" : "front", s.x, s.y, s.y + 8);
	}
	items.push({
		order: 9.5 * T,
		draw: () =>
			room.blit(
				drawFigure(outfitB, { view: "side", step: 1 }),
				13.2 * T - FRAME.feetX,
				9.5 * T - FRAME.feetY,
			),
	});
	for (const item of items.sort((a, b) => a.order - b.order)) item.draw();
	const k = 3;
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
const map = {
	...(existing ?? {}),
	type: "map",
	version: "1.10",
	tiledversion: "1.11.0",
	orientation: "orthogonal",
	renderorder: "right-down",
	infinite: false,
	width: existing?.width ?? COLS,
	height: existing?.height ?? ROWS,
	tilewidth: T,
	tileheight: T,
	compressionlevel: -1,
	tilesets: tilesets(),
	layers: existing && !args.includes("--map") ? existing.layers : layers(),
	nextlayerid: 6,
	nextobjectid: 1000,
};
writeFileSync(mapPath, `${JSON.stringify(map, null, "\t")}\n`);
const previewIndex = args.indexOf("--preview");
if (previewIndex >= 0) {
	if (!existing || args.includes("--map")) void 0;
	else layout();
	writeFileSync(
		args[previewIndex + 1] ?? "office-preview.png",
		encodePng(preview(map)),
	);
}
console.log(
	`wrote ${PROP_NAMES.length} props, ${TILE_NAMES.length} tiles, map ${map.width}x${map.height}`,
);
