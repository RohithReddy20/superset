import type { Facing } from "../../../../utils/world";
import type { Look } from "./look";
import { buildPose, type Pose, STANDING_UNITS, YAW } from "./model";
import { drawBlocks } from "./render";

export const SHEET = {
	cell: { w: 80, h: 128, feetX: 40, feetY: 122 },
	columns: 8,
	unit: 4,
	pitch: Math.PI / 6,
	frames: { idle: 4, walk: 8, sit: 1 } as Record<Pose, number>,
	rows: {
		idle: { down: 0, up: 1, right: 2, left: 3 },
		walk: { down: 4, up: 5, right: 6, left: 7 },
		sit: { down: 8, up: 9, right: 10, left: 11 },
	} as Record<Pose, Record<Facing, number>>,
};

export const STANDING_PX = Math.round(
	STANDING_UNITS * SHEET.unit * Math.cos(SHEET.pitch) +
		4 * SHEET.unit * Math.sin(SHEET.pitch),
);

const FACINGS: Facing[] = ["down", "up", "right", "left"];
const POSES: Pose[] = ["idle", "walk", "sit"];

export function renderCharacterSheet(look: Look): HTMLCanvasElement {
	const { cell, columns } = SHEET;
	const canvas = document.createElement("canvas");
	canvas.width = cell.w * columns;
	canvas.height = cell.h * 12;
	const ctx = canvas.getContext("2d");
	if (!ctx) return canvas;
	for (const pose of POSES) {
		for (const facing of FACINGS) {
			const row = SHEET.rows[pose][facing];
			const count = SHEET.frames[pose];
			for (let i = 0; i < count; i++) {
				const blocks = buildPose(look, pose, i / count);
				drawBlocks(ctx, blocks, {
					pitch: SHEET.pitch,
					yaw: YAW[facing],
					unit: SHEET.unit,
					originX: i * cell.w + cell.feetX,
					originY: row * cell.h + cell.feetY,
				});
			}
		}
	}
	return canvas;
}

const faceCache = new Map<string, string>();

export function renderFace(look: Look, key: string): string {
	const cached = faceCache.get(key);
	if (cached) return cached;
	const size = 64;
	const unit = 5;
	const pitch = Math.PI / 18;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";
	const headCentreUnits = STANDING_UNITS - 4;
	drawBlocks(ctx, buildPose(look, "idle", 0), {
		pitch,
		yaw: 0,
		unit,
		originX: size / 2,
		originY: size / 2 + headCentreUnits * unit * Math.cos(pitch),
	});
	const url = canvas.toDataURL();
	faceCache.set(key, url);
	return url;
}
