import { isFloorTile, PROPS } from "../../../tileset";
import { parseTiledWorld, type TiledMap } from "../../../utils/world";
import officeMap from "../assets/world/office.json";

/** The office as drawn in Tiled: floor tiles, props, zones, seats and spawn. */
export const WORLD = parseTiledWorld(
	officeMap as unknown as TiledMap,
	(name) => PROPS[name],
	isFloorTile,
);

export const WORLD_MAP = WORLD.map;
