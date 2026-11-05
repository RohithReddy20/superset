import { describe, expect, test } from "bun:test";
import { parseTiledWorld, type TiledMap } from "./tiled";

const map: TiledMap = {
	width: 4,
	height: 3,
	tilewidth: 32,
	tileheight: 32,
	tilesets: [
		{
			firstgid: 1,
			name: "floor-walls",
			tiles: [
				{ id: 0, properties: [{ name: "name", value: "wall-cap" }] },
				{ id: 1, properties: [{ name: "name", value: "floor-0" }] },
			],
		},
		{
			firstgid: 3,
			name: "props",
			tiles: [{ id: 0, properties: [{ name: "name", value: "desk-front" }] }],
		},
	],
	layers: [
		{
			name: "floor",
			type: "tilelayer",
			data: [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2],
		},
		{
			name: "props",
			type: "objectgroup",
			objects: [{ id: 1, gid: 3, x: 32, y: 96, width: 64, height: 46 }],
		},
		{
			name: "zones",
			type: "objectgroup",
			objects: [
				{
					id: 2,
					name: "pod-a",
					class: "team",
					x: 32,
					y: 32,
					width: 64,
					height: 64,
				},
			],
		},
		{
			name: "seats",
			type: "objectgroup",
			objects: [
				{
					id: 3,
					point: true,
					x: 64,
					y: 90,
					properties: [
						{ name: "zone", value: "pod-a" },
						{ name: "facing", value: "up" },
					],
				},
			],
		},
		{
			name: "spawn",
			type: "objectgroup",
			objects: [{ id: 4, point: true, x: 100, y: 80 }],
		},
	],
};

describe("parseTiledWorld", () => {
	test("reads floor names, blocks walls and prop footprints, and wires seats to zones", () => {
		const world = parseTiledWorld(
			map,
			(n) => (n === "desk-front" ? { footprint: 36 } : undefined),
			(n) => n.startsWith("floor-"),
		);
		expect(world.floor.slice(0, 5)).toEqual([
			"wall-cap",
			"wall-cap",
			"wall-cap",
			"wall-cap",
			"floor-0",
		]);
		expect(world.map.image).toEqual({ w: 128, h: 96 });
		expect(world.map.blocked).toContainEqual({ x: 0, y: 0, w: 32, h: 32 });
		expect(world.map.blocked).toContainEqual({ x: 32, y: 60, w: 64, h: 36 });
		expect(world.props).toEqual([
			{ name: "desk-front", x: 32, y: 96, w: 64, h: 46 },
		]);
		expect(world.map.zones).toHaveLength(1);
		expect(world.map.zones[0]?.kind).toBe("team");
		expect(world.map.zones[0]?.seats).toEqual([{ x: 64, y: 90, facing: "up" }]);
		expect(world.map.spawn).toEqual({ x: 100, y: 80 });
	});
});
