import {
	drawFace,
	drawFigure,
	FRAME,
	type Outfit,
	type Pose,
	Sprite,
	type View,
} from "../../../../tileset";
import type { Facing } from "../../../../utils/world";
import type { Look } from "./look";

export const SHEET = {
	cell: { w: FRAME.w, h: FRAME.h, feetX: FRAME.feetX, feetY: FRAME.feetY },
	columns: 4,
	frames: { idle: 2, walk: 4, sit: 1 } as Record<
		"idle" | "walk" | "sit",
		number
	>,
	rows: {
		idle: { down: 0, up: 1, right: 2, left: 3 },
		walk: { down: 4, up: 5, right: 6, left: 7 },
		sit: { down: 8, up: 9, right: 10, left: 11 },
	} as Record<"idle" | "walk" | "sit", Record<Facing, number>>,
};

export function outfitOf(look: Look): Outfit {
	return {
		skin: look.skin,
		hair: look.hair,
		hairRows:
			look.hairStyle === "bald"
				? 0
				: look.hairStyle === "cap"
					? 5
					: look.hairStyle === "short"
						? 3
						: 4,
		long: look.hairStyle === "long" || look.hairStyle === "curly",
		top: look.top,
		trousers: look.trousers,
		shoes: look.shoes,
		accent: look.accent,
	};
}

const VIEW: Record<Facing, View> = {
	down: "front",
	up: "back",
	right: "side",
	left: "side",
};

function frames(
	outfit: Outfit,
	kind: "idle" | "walk" | "sit",
	facing: Facing,
): Sprite[] {
	const view = VIEW[facing];
	const poses: Pose[] =
		kind === "idle"
			? [{ view }, { view, breath: true }]
			: kind === "walk"
				? [0, 1, 2, 3].map((step) => ({ view, step }))
				: [{ view, seated: true }];
	return poses.map((pose) => {
		const sprite = drawFigure(outfit, pose);
		return facing === "left" ? sprite.mirrored() : sprite;
	});
}

/** Every frame of one teammate on a canvas, laid out as SHEET says. */
export function renderCharacterSheet(look: Look): HTMLCanvasElement {
	const outfit = outfitOf(look);
	const { cell, columns } = SHEET;
	const sheet = new Sprite(cell.w * columns, cell.h * 12);
	for (const kind of ["idle", "walk", "sit"] as const)
		for (const facing of ["down", "up", "right", "left"] as const)
			frames(outfit, kind, facing).forEach((frame, i) => {
				sheet.blit(frame, i * cell.w, SHEET.rows[kind][facing] * cell.h);
			});
	return toCanvas(sheet);
}

export function toCanvas(sprite: Sprite): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = sprite.w;
	canvas.height = sprite.h;
	const ctx = canvas.getContext("2d");
	ctx?.putImageData(
		new ImageData(new Uint8ClampedArray(sprite.data), sprite.w, sprite.h),
		0,
		0,
	);
	return canvas;
}

const faceCache = new Map<string, string>();

/** A 64px avatar of the teammate's face, as a data URL. */
export function renderFace(look: Look, key: string): string {
	const cached = faceCache.get(key);
	if (cached) return cached;
	const face = drawFace(outfitOf(look));
	const scale = 4;
	const canvas = document.createElement("canvas");
	canvas.width = face.w * scale;
	canvas.height = face.h * scale;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(toCanvas(face), 0, 0, canvas.width, canvas.height);
	const url = canvas.toDataURL();
	faceCache.set(key, url);
	return url;
}
