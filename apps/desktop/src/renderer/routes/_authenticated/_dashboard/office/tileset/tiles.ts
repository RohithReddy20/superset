import { Sprite } from "./pixels";

export const TILE = 32;

function concrete(variant: number): Sprite {
	const s = new Sprite(TILE, TILE);
	s.rect(0, 0, TILE, TILE, "floorA");
	s.hline(0, 0, TILE, "seam");
	s.vline(0, 0, TILE, "seam");
	if (variant === 1) {
		s.rect(12, 20, 2, 1, "floorB");
		s.rect(22, 8, 1, 2, "floorB");
	}
	if (variant === 2) {
		s.rect(6, 6, 1, 1, "g1");
		s.rect(24, 18, 2, 1, "floorB");
	}
	return s;
}

function wood(variant: number): Sprite {
	const s = new Sprite(TILE, TILE);
	for (let row = 0; row < 4; row++) {
		const y = row * 8;
		s.rect(0, y, TILE, 8, (row + variant) % 2 ? "woodB" : "woodA");
		s.hline(0, y, TILE, "woodSeam");
		if ((row + variant) % 3 === 0)
			s.vline((row * 11 + variant * 9 + 5) % TILE, y + 1, 7, "woodSeam");
		s.hline((row * 7 + variant * 13 + 3) % 24, y + 4, 5, "woodSeam");
	}
	return s;
}

function carpet(variant: number): Sprite {
	const s = new Sprite(TILE, TILE);
	s.rect(0, 0, TILE, TILE, "carpetA");
	for (let y = 2; y < TILE; y += 4)
		for (let x = (y / 2 + variant * 2) % 4; x < TILE; x += 4)
			s.px(x, y, "carpetB");
	return s;
}

function kitchenTile(): Sprite {
	const s = new Sprite(TILE, TILE);
	for (let q = 0; q < 4; q++) {
		const x = (q % 2) * 16;
		const y = Math.floor(q / 2) * 16;
		s.rect(x, y, 16, 16, q === 0 || q === 3 ? "tileA" : "tileB");
		s.hline(x, y, 16, "seam");
		s.vline(x, y, 16, "seam");
	}
	return s;
}

/** Wall edges that touch something lower: north, east, south, west. */
export const EDGE = { n: 1, e: 2, s: 4, w: 8 } as const;

/** Top of a wall seen from above; `open` marks the sides that drop to floor or to a wall face. */
function cap(open: number): Sprite {
	const s = new Sprite(TILE, TILE);
	s.rect(0, 0, TILE, TILE, "g5");
	if (open & EDGE.n) {
		s.hline(0, 0, TILE, "g1");
		s.hline(0, 1, TILE, "g7");
	}
	if (open & EDGE.w) {
		s.vline(0, 0, TILE, "g1");
		s.vline(1, open & EDGE.n ? 1 : 0, TILE, "g7");
	}
	if (open & EDGE.e) {
		s.vline(TILE - 2, 0, TILE, "g4");
		s.vline(TILE - 1, 0, TILE, "g1");
	}
	if (open & EDGE.s) s.hline(0, TILE - 1, TILE, "g2");
	return s;
}

/** Front of a wall, with its skirting board; `open` marks the sides that end the face. */
function face(open: number): Sprite {
	const s = new Sprite(TILE, TILE);
	s.rect(0, 0, TILE, TILE, "g3");
	s.hline(0, 0, TILE, "g2");
	s.rect(0, TILE - 4, TILE, 4, "g2");
	s.hline(0, TILE - 4, TILE, "g4");
	s.hline(0, TILE - 1, TILE, "g1");
	if (open & EDGE.w) s.vline(0, 0, TILE, "g1");
	if (open & EDGE.e) s.vline(TILE - 1, 0, TILE, "g1");
	return s;
}

export type FloorMaterial = "concrete" | "wood" | "carpet" | "tile";

const FLOORS: Record<FloorMaterial, (() => Sprite)[]> = {
	concrete: [0, 1, 2].map((v) => () => concrete(v)),
	wood: [0, 1, 2].map((v) => () => wood(v)),
	carpet: [0, 1].map((v) => () => carpet(v)),
	tile: [kitchenTile],
};

export function floorTileName(
	material: FloorMaterial,
	variant: number,
): string {
	const count = FLOORS[material].length;
	return material === "concrete"
		? `floor-${variant % count}`
		: `floor-${material}-${variant % count}`;
}

export const capTileName = (open: number) => `cap-${open}`;
export const faceTileName = (open: number) =>
	`face-${open & (EDGE.e | EDGE.w)}`;

export const TILES: Record<string, () => Sprite> = Object.fromEntries([
	...(Object.keys(FLOORS) as FloorMaterial[]).flatMap((material) =>
		FLOORS[material].map((draw, v) => [floorTileName(material, v), draw]),
	),
	...Array.from({ length: 16 }, (_, open) => [
		capTileName(open),
		() => cap(open),
	]),
	...[0, EDGE.e, EDGE.w, EDGE.e | EDGE.w].map((open) => [
		faceTileName(open),
		() => face(open),
	]),
]);

export const TILE_NAMES = Object.keys(TILES);

export function isFloorTile(name: string): boolean {
	return name.startsWith("floor-");
}

/** All tiles side by side, in TILE_NAMES order, as one strip. */
export function tileStrip(): Sprite {
	const strip = new Sprite(TILE * TILE_NAMES.length, TILE);
	TILE_NAMES.forEach((name, i) => {
		strip.blit(TILES[name]?.() ?? new Sprite(TILE, TILE), i * TILE, 0);
	});
	return strip;
}
