import { Sprite, shade } from "../../../../../../tileset";
import {
	type CityBuilding,
	type CityLayout,
	GROUND_H,
	type Rect,
	ROAD,
	ROOF_H,
	SIDEWALK,
} from "../../../../../utils/cityLayout";

const GRASS = "#2f4f3a";
const GRASS_DARK = "#294634";
const GRASS_LIGHT = "#37593f";
const ASPHALT = "#2b2f38";
const LANE = "#646b7a";
const CROSSWALK = "#8a909c";
const PAVEMENT = "#5a616f";
const PAVEMENT_SEAM = "#4f5563";
const CURB = "#737b8a";
const OUTLINE = "#11161f";
const GLASS = "#1d2636";
const LOBBY_GLASS = "#34507a";

export const WALL_COLORS = [
	"#6b7a8f",
	"#8a6f5a",
	"#5f7f6e",
	"#7b6a8c",
	"#8c7a5b",
	"#5c6f8a",
	"#8a5f66",
	"#6a7d5a",
];

export function hashOf(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function random(seed: number): () => number {
	let s = seed || 1;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Roads, crossings, pavements and lawns for the whole city, in one image. */
export function drawGround(layout: CityLayout): Sprite {
	const sprite = new Sprite(layout.w, layout.h);
	const roll = random(layout.w * 31 + layout.h);
	sprite.rect(0, 0, layout.w, layout.h, ASPHALT);
	const vertical = layout.roads.filter((r) => r.h > r.w);
	const horizontal = layout.roads.filter((r) => r.w >= r.h);
	const crosses = (x: number, y: number) =>
		vertical.some((v) => x >= v.x && x < v.x + v.w) &&
		horizontal.some((r) => y >= r.y && y < r.y + r.h);

	for (const road of horizontal) {
		const y = road.y + Math.floor(road.h / 2) - 1;
		for (let x = 0; x < layout.w; x += 12)
			if (!crosses(x, y) && !crosses(x + 5, y)) sprite.rect(x, y, 6, 2, LANE);
	}
	for (const road of vertical) {
		const x = road.x + Math.floor(road.w / 2) - 1;
		for (let y = 0; y < layout.h; y += 12)
			if (!crosses(x, y) && !crosses(x, y + 5)) sprite.rect(x, y, 2, 6, LANE);
	}
	for (const v of vertical)
		for (const r of horizontal) {
			for (let i = 3; i < ROAD - 3; i += 4) {
				sprite.rect(v.x + i, r.y - 6, 2, 5, CROSSWALK);
				sprite.rect(v.x + i, r.y + r.h + 1, 2, 5, CROSSWALK);
			}
		}

	for (const building of layout.buildings) drawLot(sprite, building.lot, roll);
	return sprite;
}

function drawLot(sprite: Sprite, lot: Rect, roll: () => number): void {
	sprite.rect(lot.x, lot.y, lot.w, lot.h, PAVEMENT);
	sprite.frame(lot.x, lot.y, lot.w, lot.h, CURB);
	for (let x = lot.x + 8; x < lot.x + lot.w; x += 8)
		sprite.vline(x, lot.y + 1, lot.h - 2, PAVEMENT_SEAM);
	for (let y = lot.y + 8; y < lot.y + lot.h; y += 8)
		sprite.hline(lot.x + 1, y, lot.w - 2, PAVEMENT_SEAM);

	const lawn = {
		x: lot.x + SIDEWALK,
		y: lot.y + SIDEWALK,
		w: lot.w - SIDEWALK * 2,
		h: lot.h - SIDEWALK * 2,
	};
	sprite.rect(lawn.x, lawn.y, lawn.w, lawn.h, GRASS);
	for (let i = 0; i < (lawn.w * lawn.h) / 24; i++) {
		const x = lawn.x + Math.floor(roll() * lawn.w);
		const y = lawn.y + Math.floor(roll() * lawn.h);
		sprite.px(x, y, roll() < 0.5 ? GRASS_DARK : GRASS_LIGHT);
	}
	drawTree(sprite, lawn.x + 6, lawn.y + 14);
	drawTree(sprite, lawn.x + lawn.w - 7, lawn.y + 14);
	drawTree(sprite, lawn.x + 6, lawn.y + lawn.h - 30);
	drawTree(sprite, lawn.x + lawn.w - 7, lawn.y + lawn.h - 30);
	drawLamp(sprite, lot.x + 3, lot.y + lot.h - 4);
	drawLamp(sprite, lot.x + lot.w - 4, lot.y + lot.h - 4);
}

function drawTree(sprite: Sprite, cx: number, baseY: number): void {
	sprite.shadow(cx - 4, baseY - 1, 9, 3, 70);
	sprite.rect(cx - 1, baseY - 5, 2, 5, "#5b3a29");
	const canopy = [
		[-2, -14, 5],
		[-4, -13, 9],
		[-5, -11, 11],
		[-5, -9, 11],
		[-4, -7, 9],
		[-2, -6, 5],
	] as const;
	for (const [dx, dy, w] of canopy)
		sprite.rect(cx + dx, baseY + dy, w, 2, "#2f6b3f");
	sprite.rect(cx - 3, baseY - 12, 3, 2, "#3f8a52");
	sprite.rect(cx + 1, baseY - 8, 3, 1, "#245633");
}

function drawLamp(sprite: Sprite, x: number, baseY: number): void {
	sprite.vline(x, baseY - 10, 10, "#9aa3b2");
	sprite.rect(x - 1, baseY - 12, 3, 2, "#ffe9a8");
}

/** A building's front: walls, floor bands, dark window glass, the lobby and a roof with a prop on it. */
export function drawBuilding(building: CityBuilding, wall: string): Sprite {
	const { body } = building;
	const sprite = new Sprite(body.w, body.h);
	const seed = hashOf(building.id);
	const top = ROOF_H;
	const height = body.h - ROOF_H;

	drawRoofProp(sprite, seed, body.w);
	sprite.rect(0, top, body.w, height, wall);
	sprite.rect(body.w - 6, top, 6, height, shade(wall, -0.08));
	sprite.rect(0, top, 2, height, shade(wall, 0.05));
	sprite.rect(0, top, body.w, 4, shade(wall, 0.14));
	sprite.hline(0, top + 4, body.w, shade(wall, -0.2));

	const groundTop = body.h - GROUND_H;
	for (let y = groundTop; y > top + 5; y -= 22)
		sprite.hline(1, y, body.w - 2, shade(wall, -0.14));
	for (const w of building.windows) {
		const x = w.x - body.x;
		const y = w.y - body.y;
		sprite.box(x - 1, y - 1, w.w + 2, w.h + 2, GLASS, OUTLINE);
		sprite.hline(x - 1, y + w.h + 1, w.w + 2, shade(wall, 0.12));
	}

	sprite.rect(1, groundTop + 1, body.w - 2, GROUND_H - 1, shade(wall, -0.16));
	const doorX = Math.floor(body.w / 2) - 7;
	sprite.box(doorX, body.h - 18, 14, 18, "#2a3446", OUTLINE);
	sprite.vline(doorX + 7, body.h - 17, 17, OUTLINE);
	sprite.px(doorX + 5, body.h - 9, "#c9cdd6");
	sprite.px(doorX + 8, body.h - 9, "#c9cdd6");
	const accent = shade(wall, 0.25);
	for (let i = 0; i < 22; i++)
		sprite.rect(
			doorX - 4 + i,
			body.h - 23,
			1,
			4,
			i % 4 < 2 ? accent : shade(accent, -0.12),
		);
	for (const lx of [6, body.w - 26]) {
		sprite.box(lx, body.h - 18, 20, 12, LOBBY_GLASS, OUTLINE);
		sprite.hline(lx + 2, body.h - 16, 8, shade(LOBBY_GLASS, 0.2));
	}

	sprite.frame(0, top, body.w, height, OUTLINE);
	return sprite;
}

function drawRoofProp(sprite: Sprite, seed: number, width: number): void {
	const kind = seed % 3;
	const x = 8 + (seed % (width - 30));
	if (kind === 0) {
		sprite.box(x, 2, 10, 9, "#7a5a3c", OUTLINE);
		sprite.hline(x + 1, 4, 8, "#8d6a48");
		sprite.vline(x + 2, 10, 2, OUTLINE);
		sprite.vline(x + 7, 10, 2, OUTLINE);
	} else if (kind === 1) {
		sprite.box(x, 5, 14, 7, "#8e96a3", OUTLINE);
		sprite.rect(x + 2, 7, 4, 3, "#5b6270");
		sprite.rect(x + 8, 7, 4, 3, "#5b6270");
	} else {
		sprite.vline(x + 3, 0, 12, "#9aa3b2");
		sprite.hline(x, 3, 7, "#9aa3b2");
		sprite.px(x + 3, 0, "#ff5a5a");
	}
}

/** The project's own colour when it has one, else a steady pick from the city's wall colours. */
export function wallColorFor(project: {
	id: string;
	color: string | null;
}): string {
	return (
		project.color ??
		(WALL_COLORS[hashOf(project.id) % WALL_COLORS.length] as string)
	);
}
