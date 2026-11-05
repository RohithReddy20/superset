import { type Color, Sprite, shade } from "./pixels";

export type View = "front" | "back" | "side";

export interface Outfit {
	skin: Color;
	hair: Color;
	/** Hair rows on top of the head; 0 for bald. */
	hairRows: number;
	long: boolean;
	top: Color;
	trousers: Color;
	shoes: Color;
	accent: Color | null;
}

export const FRAME = { w: 32, h: 48, feetX: 16, feetY: 48 };
/** Pixels from the feet line to the top of the head when standing. */
export const STANDING_PX = 41;

const HX = 11;
const HY = 7;
const HW = 10;
const HH = 11;
const BODY_Y = HY + HH;

export interface Pose {
	view: View;
	/** Walk phase 0..3; 0 is also the standing frame. */
	step?: number;
	seated?: boolean;
	/** Idle breathing frame: raised by one pixel. */
	breath?: boolean;
}

export function drawFigure(o: Outfit, pose: Pose): Sprite {
	const s = new Sprite(FRAME.w, FRAME.h);
	const step = pose.step ?? 0;
	const topL = shade(o.top, 0.08);
	const topD = shade(o.top, -0.1);
	const skinD = shade(o.skin, -0.12);
	const hair = (x: number, y: number, w: number, h: number) => {
		if (o.hairRows > 0) s.rect(x, y, w, h, o.hair);
	};
	if (pose.seated) return seated(s, o, pose.view, { topL, topD, skinD, hair });
	const bob = pose.breath || step === 1 || step === 3 ? 1 : 0;
	const ly = BODY_Y + 14;
	if (pose.view === "side") {
		const swing = [
			[0, 0],
			[3, -3],
			[0, 0],
			[-3, 3],
		][step] as [number, number];
		s.box(HX + 2 + swing[0], ly, 5, 10, o.trousers);
		s.box(HX + 4 + swing[1], ly, 5, 10, o.trousers);
		s.box(HX + 1 + swing[0], ly + 9, 7, 4, o.shoes);
		s.box(HX + 4 + swing[1], ly + 9, 7, 4, o.shoes);
	} else {
		const lift = [
			[0, 0],
			[2, 0],
			[0, 0],
			[0, 2],
		][step] as [number, number];
		s.box(HX, ly, 4, 10 - lift[0], o.trousers);
		s.box(HX + HW - 4, ly, 4, 10 - lift[1], o.trousers);
		s.box(HX - 1, ly + 9 - lift[0], 6, 4, o.shoes);
		s.box(HX + HW - 5, ly + 9 - lift[1], 6, 4, o.shoes);
	}
	const by = BODY_Y - bob;
	s.box(HX - 2, by, HW + 4, 15, o.top);
	s.rect(HX - 1, by + 1, HW + 2, 1, topL);
	s.vline(HX - 2, by, 15, topD);
	s.vline(HX + HW + 1, by, 15, topD);
	if (pose.view === "side") {
		const a = [0, 2, 0, -2][step] ?? 0;
		s.box(HX + 4 + a, by + 2, 5, 11, o.top);
		s.rect(HX + 5 + a, by + 11, 3, 3, o.skin);
	} else {
		s.box(HX - 4, by + 2, 3, 11, o.top);
		s.box(HX + HW + 1, by + 2, 3, 11, o.top);
		s.rect(HX - 3, by + 11, 1, 3, o.skin);
		s.rect(HX + HW + 2, by + 11, 1, 3, o.skin);
	}
	const hy = HY - bob;
	s.box(HX, hy, HW, HH, o.skin);
	s.vline(HX, hy, HH, skinD);
	hair(HX, hy, HW, o.hairRows);
	s.frame(HX, hy, HW, HH, "g0");
	if (pose.view === "front") {
		s.rect(HX + 2, hy + 6, 2, 2, "g0");
		s.rect(HX + 6, hy + 6, 2, 2, "g0");
		s.rect(HX + 4, hy + 9, 2, 1, skinD);
		if (o.accent) {
			s.vline(HX + 3, by + 1, 6, o.accent);
			s.vline(HX + 6, by + 1, 6, o.accent);
		}
		if (o.long) {
			hair(HX, hy + 4, 2, 7);
			hair(HX + HW - 2, hy + 4, 2, 7);
		}
	} else if (pose.view === "back") {
		s.rect(HX, hy, HW, HH, o.hairRows > 0 ? o.hair : o.skin);
		s.frame(HX, hy, HW, HH, "g0");
		s.rect(HX + 1, hy + HH - 3, HW - 2, 3, o.skin);
		if (o.long) {
			hair(HX + 3, hy + 6, 4, 12);
			s.frame(HX + 3, hy + 6, 4, 12, "g0");
		}
		s.rect(HX - 1, by, HW + 2, 3, topD);
	} else {
		hair(HX + 1, hy + 1, 5, HH - 2);
		hair(HX + 1, hy + 1, HW - 2, Math.max(0, o.hairRows - 1));
		s.rect(HX + 6, hy + 6, 2, 2, "g0");
		s.rect(HX + HW - 1, hy + 5, 1, 4, skinD);
		if (o.long) {
			hair(HX - 1, hy + 5, 3, 12);
			s.frame(HX - 1, hy + 5, 3, 12, "g0");
		}
	}
	return s;
}

function seated(
	s: Sprite,
	o: Outfit,
	view: View,
	c: {
		topL: Color;
		topD: Color;
		skinD: Color;
		hair: (x: number, y: number, w: number, h: number) => void;
	},
): Sprite {
	const oy = 14;
	const by = BODY_Y + oy;
	const hy = HY + oy;
	if (view === "front") {
		s.box(HX - 1, by + 10, HW + 2, 6, o.trousers);
		s.box(HX, by + 15, 4, 3, o.shoes);
		s.box(HX + HW - 4, by + 15, 4, 3, o.shoes);
	}
	s.box(HX - 2, by, HW + 4, 12, o.top);
	s.rect(HX - 1, by + 1, HW + 2, 1, c.topL);
	s.vline(HX - 2, by, 12, c.topD);
	s.vline(HX + HW + 1, by, 12, c.topD);
	if (view !== "side") {
		s.box(HX - 4, by + 2, 3, 8, o.top);
		s.box(HX + HW + 1, by + 2, 3, 8, o.top);
	}
	s.box(HX, hy, HW, HH, o.skin);
	c.hair(HX, hy, HW, o.hairRows);
	s.frame(HX, hy, HW, HH, "g0");
	if (view === "front") {
		s.rect(HX + 2, hy + 6, 2, 2, "g0");
		s.rect(HX + 6, hy + 6, 2, 2, "g0");
		if (o.accent) {
			s.vline(HX + 3, by + 1, 5, o.accent);
			s.vline(HX + 6, by + 1, 5, o.accent);
		}
		if (o.long) {
			c.hair(HX, hy + 4, 2, 7);
			c.hair(HX + HW - 2, hy + 4, 2, 7);
		}
	} else if (view === "back") {
		s.rect(HX, hy, HW, HH, o.hairRows > 0 ? o.hair : o.skin);
		s.frame(HX, hy, HW, HH, "g0");
		s.rect(HX + 1, hy + HH - 3, HW - 2, 3, o.skin);
		s.rect(HX - 1, by, HW + 2, 3, c.topD);
		if (o.long) {
			c.hair(HX + 3, hy + 6, 4, 12);
			s.frame(HX + 3, hy + 6, 4, 12, "g0");
		}
	} else {
		s.box(HX + 2, by + 10, 10, 5, o.trousers);
		s.box(HX + 9, by + 13, 6, 3, o.shoes);
		c.hair(HX + 1, hy + 1, 5, HH - 2);
		s.rect(HX + 6, hy + 5, 2, 2, "g0");
	}
	return s;
}

/** Head only, for avatars: the front idle frame cropped to the face. */
export function drawFace(o: Outfit): Sprite {
	const figure = drawFigure(o, { view: "front" });
	const face = new Sprite(HW + 4, HH + 4);
	const crop = new Sprite(HW + 4, HH + 4);
	for (let y = 0; y < crop.h; y++)
		for (let x = 0; x < crop.w; x++) {
			const sx = HX - 2 + x;
			const sy = HY - 2 + y;
			crop.data.set(
				figure.data.subarray(
					(sy * figure.w + sx) * 4,
					(sy * figure.w + sx) * 4 + 4,
				),
				(y * crop.w + x) * 4,
			);
		}
	face.blit(crop, 0, 0);
	return face;
}
