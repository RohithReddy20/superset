import type {
	Facing,
	Point,
	Rect,
	Seat,
	WorldMap,
	Zone,
	ZoneKind,
} from "./world";

/** The parts of a Tiled JSON map (tiled.json format, embedded tilesets) the office reads. */
export interface TiledProperty {
	name: string;
	type?: string;
	value: unknown;
}

export interface TiledObject {
	id: number;
	name?: string;
	type?: string;
	class?: string;
	gid?: number;
	x: number;
	y: number;
	width?: number;
	height?: number;
	point?: boolean;
	properties?: TiledProperty[];
}

export interface TiledLayer {
	name: string;
	type: "tilelayer" | "objectgroup";
	data?: number[];
	objects?: TiledObject[];
	visible?: boolean;
}

export interface TiledTile {
	id: number;
	properties?: TiledProperty[];
}

export interface TiledTileset {
	firstgid: number;
	name: string;
	tiles?: TiledTile[];
}

export interface TiledMap {
	width: number;
	height: number;
	tilewidth: number;
	tileheight: number;
	layers: TiledLayer[];
	tilesets: TiledTileset[];
}

export interface PropPlacement {
	name: string;
	/** Bottom-left corner, as Tiled stores tile objects. */
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface PropInfo {
	footprint: number;
}

export interface ParsedWorld {
	map: WorldMap;
	cols: number;
	rows: number;
	tileSize: number;
	/** Row-major floor tile names, "" where empty. */
	floor: string[];
	props: PropPlacement[];
}

const FACINGS: Facing[] = ["down", "left", "right", "up"];
const ZONE_KINDS: ZoneKind[] = ["team", "lounge", "meeting", "booth"];

function prop(obj: { properties?: TiledProperty[] }, name: string): unknown {
	return obj.properties?.find((p) => p.name === name)?.value;
}

function tileName(map: TiledMap, gid: number): string {
	const set = [...map.tilesets]
		.sort((a, b) => b.firstgid - a.firstgid)
		.find((t) => gid >= t.firstgid);
	if (!set) return "";
	const tile = set.tiles?.find((t) => t.id === gid - set.firstgid);
	return typeof prop(tile ?? {}, "name") === "string"
		? (prop(tile ?? {}, "name") as string)
		: "";
}

/** Turns the Tiled map into the office's world model: seats, zones and blocked rects. */
export function parseTiledWorld(
	map: TiledMap,
	propInfo: (name: string) => PropInfo | undefined,
	isFloor: (tileName: string) => boolean,
): ParsedWorld {
	const { width: cols, height: rows, tilewidth: tileSize } = map;
	const layer = (name: string) => map.layers.find((l) => l.name === name);
	const floorLayer = layer("floor");
	const floor: string[] = new Array(cols * rows).fill("");
	const blocked: Rect[] = [];
	floorLayer?.data?.forEach((gid, i) => {
		const name = gid ? tileName(map, gid) : "";
		floor[i] = name;
		if (name && !isFloor(name))
			blocked.push({
				x: (i % cols) * tileSize,
				y: Math.floor(i / cols) * tileSize,
				w: tileSize,
				h: tileSize,
			});
	});

	const props: PropPlacement[] = [];
	for (const obj of layer("props")?.objects ?? []) {
		if (!obj.gid || !obj.width || !obj.height) continue;
		const name = tileName(map, obj.gid);
		if (!name) continue;
		props.push({ name, x: obj.x, y: obj.y, w: obj.width, h: obj.height });
		const footprint = propInfo(name)?.footprint ?? 0;
		if (footprint > 0)
			blocked.push({
				x: obj.x,
				y: obj.y - footprint,
				w: obj.width,
				h: footprint,
			});
	}

	const seatsByZone = new Map<string, Seat[]>();
	for (const obj of layer("seats")?.objects ?? []) {
		const zoneId = String(prop(obj, "zone") ?? "");
		const facing = String(prop(obj, "facing") ?? "down") as Facing;
		const seat: Seat = {
			x: obj.x,
			y: obj.y,
			facing: FACINGS.includes(facing) ? facing : "down",
		};
		seatsByZone.set(zoneId, [...(seatsByZone.get(zoneId) ?? []), seat]);
	}

	const zones: Zone[] = [];
	for (const obj of layer("zones")?.objects ?? []) {
		const id = obj.name ?? String(obj.id);
		const kind = (obj.class ?? obj.type ?? "team") as ZoneKind;
		const label = prop(obj, "label");
		const signX = prop(obj, "signX");
		const signY = prop(obj, "signY");
		zones.push({
			id,
			kind: ZONE_KINDS.includes(kind) ? kind : "team",
			rect: { x: obj.x, y: obj.y, w: obj.width ?? 0, h: obj.height ?? 0 },
			seats: seatsByZone.get(id) ?? [],
			...(typeof label === "string" ? { label } : {}),
			...(typeof signX === "number" && typeof signY === "number"
				? { sign: { x: signX, y: signY } }
				: {}),
		});
	}

	const spawnObj = layer("spawn")?.objects?.[0];
	const spawn: Point = spawnObj
		? { x: spawnObj.x, y: spawnObj.y }
		: { x: (cols * tileSize) / 2, y: (rows - 2) * tileSize };

	return {
		map: {
			image: { w: cols * tileSize, h: rows * tileSize },
			zones,
			spawn,
			blocked,
			doors: [],
		},
		cols,
		rows,
		tileSize,
		floor,
		props,
	};
}
