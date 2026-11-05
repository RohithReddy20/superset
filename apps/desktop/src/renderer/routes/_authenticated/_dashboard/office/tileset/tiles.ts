import { Sprite } from "./pixels";

export const TILE = 32;
const CAP = 12;

function floor(variant: number): Sprite {
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

function wallCap(): Sprite {
	const s = new Sprite(TILE, TILE);
	s.rect(0, 0, TILE, TILE, "g5");
	s.hline(0, 0, TILE, "g7");
	s.hline(0, TILE - 1, TILE, "g2");
	return s;
}

function wallFace(): Sprite {
	const s = new Sprite(TILE, TILE);
	s.rect(0, 0, TILE, TILE, "g3");
	s.hline(0, 0, TILE, "g2");
	s.rect(0, TILE - 4, TILE, 4, "g2");
	s.hline(0, TILE - 4, TILE, "g4");
	s.hline(0, TILE - 1, TILE, "g1");
	return s;
}

function capColumn(s: Sprite, left: boolean): void {
	const x = left ? 0 : TILE - CAP;
	s.rect(x, 0, CAP, TILE, "g5");
	s.vline(x + (left ? CAP - 1 : 0), 0, TILE, "g2");
	s.vline(x + (left ? 0 : CAP - 1), 0, TILE, "g7");
	if (left) s.vline(CAP, 0, TILE, "shadow");
}

function side(left: boolean): Sprite {
	const s = floor(0);
	capColumn(s, left);
	return s;
}

function capRow(s: Sprite): void {
	s.rect(0, TILE - CAP, TILE, CAP, "g5");
	s.hline(0, TILE - CAP, TILE, "g7");
	s.hline(0, TILE - 1, TILE, "g2");
}

function front(): Sprite {
	const s = floor(0);
	capRow(s);
	return s;
}

function corner(left: boolean, top: boolean): Sprite {
	if (top) {
		const s = wallCap();
		s.vline(left ? 0 : TILE - 1, 0, TILE, "g7");
		return s;
	}
	const s = side(left);
	capRow(s);
	s.vline(left ? 0 : TILE - 1, TILE - CAP, CAP, "g7");
	return s;
}

function faceEdge(left: boolean): Sprite {
	const s = wallFace();
	capColumn(s, left);
	return s;
}

export const TILES: Record<string, () => Sprite> = {
	"floor-0": () => floor(0),
	"floor-1": () => floor(1),
	"floor-2": () => floor(2),
	"wall-cap": wallCap,
	"wall-face": wallFace,
	"side-left": () => side(true),
	"side-right": () => side(false),
	front,
	"corner-tl": () => corner(true, true),
	"corner-tr": () => corner(false, true),
	"corner-bl": () => corner(true, false),
	"corner-br": () => corner(false, false),
	"face-left": () => faceEdge(true),
	"face-right": () => faceEdge(false),
};

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
