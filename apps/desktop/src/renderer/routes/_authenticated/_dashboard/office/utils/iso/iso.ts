export const TILE_W = 64;
export const TILE_H = 32;

export interface Tile {
	x: number;
	y: number;
}

export interface Point {
	x: number;
	y: number;
}

/** Tile coordinates (floor units) to screen pixels. Depth grows with x + y. */
export function toScreen({ x, y }: Tile): Point {
	return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

export function depth({ x, y }: Tile): number {
	return x + y;
}

export function rhombus(tile: Tile, w = 1, h = 1): string {
	const a = toScreen(tile);
	const b = toScreen({ x: tile.x + w, y: tile.y });
	const c = toScreen({ x: tile.x + w, y: tile.y + h });
	const d = toScreen({ x: tile.x, y: tile.y + h });
	return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
}

/** The three visible faces of a box standing on the floor, in screen points. */
export function box(tile: Tile, w: number, h: number, height: number) {
	const lift = (p: Point) => ({ x: p.x, y: p.y - height });
	const a = toScreen(tile);
	const b = toScreen({ x: tile.x + w, y: tile.y });
	const c = toScreen({ x: tile.x + w, y: tile.y + h });
	const d = toScreen({ x: tile.x, y: tile.y + h });
	const [A, B, C, D] = [a, b, c, d].map(lift) as [Point, Point, Point, Point];
	const poly = (points: Point[]) =>
		points.map((p) => `${p.x},${p.y}`).join(" ");
	return {
		top: poly([A, B, C, D]),
		left: poly([D, C, c, d]),
		right: poly([C, B, b, c]),
	};
}
