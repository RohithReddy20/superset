import type { PaletteKey } from "./palette";
import { Sprite } from "./pixels";

export interface Prop {
	draw: () => Sprite;
	/** Height in pixels from the bottom edge that blocks walking. 0 for wall hangings and rugs. */
	footprint: number;
	/** Drawn under everything else, like a rug. */
	flat?: boolean;
}

function desk(screenVisible: boolean): Sprite {
	const s = new Sprite(64, 46);
	s.box(0, 10, 64, 14, "g5");
	s.hline(1, 11, 62, "g7");
	s.box(0, 23, 64, 18, "g3");
	s.hline(1, 24, 62, "g4");
	s.rect(44, 26, 16, 13, "g2");
	s.frame(44, 26, 16, 13, "g1");
	s.hline(45, 32, 14, "g1");
	s.rect(50, 29, 3, 1, "g8");
	s.rect(50, 35, 3, 1, "g8");
	s.rect(2, 41, 3, 5, "g1");
	s.rect(59, 41, 3, 5, "g1");
	s.rect(6, 41, 52, 2, "shadow");
	if (screenVisible) {
		s.box(20, 0, 24, 15, "g1");
		s.rect(22, 2, 20, 11, "screen");
		s.rect(22, 2, 20, 3, "g11");
		s.rect(24, 9, 8, 1, "screenD");
		s.rect(24, 11, 12, 1, "screenD");
		s.rect(31, 15, 2, 2, "g1");
		s.rect(28, 17, 8, 1, "g1");
		s.box(14, 18, 20, 4, "g2");
		s.rect(37, 18, 4, 4, "g2");
		s.px(38, 19, "g6");
		s.rect(50, 14, 5, 5, "teal");
		s.rect(50, 14, 5, 1, "tealD");
		s.px(55, 16, "teal");
	} else {
		s.box(20, 0, 24, 15, "g2");
		s.rect(22, 2, 20, 11, "g3");
		s.rect(30, 5, 4, 4, "g4");
		s.rect(31, 15, 2, 2, "g1");
		s.rect(28, 17, 8, 1, "g1");
		s.rect(8, 14, 5, 5, "rust");
		s.rect(8, 14, 5, 1, "rustD");
	}
	return s;
}

function chair(backView: boolean): Sprite {
	const s = new Sprite(22, 26);
	if (backView) {
		s.box(2, 0, 18, 14, "g4");
		s.hline(3, 1, 16, "g6");
		s.rect(4, 4, 14, 8, "g3");
		s.box(0, 13, 22, 7, "g3");
		s.hline(1, 14, 20, "g5");
	} else {
		s.box(2, 0, 18, 10, "g4");
		s.hline(3, 1, 16, "g6");
		s.box(0, 8, 22, 10, "g5");
		s.hline(1, 9, 20, "g7");
		s.rect(2, 12, 18, 4, "g4");
	}
	s.rect(10, 19, 2, 4, "g1");
	s.rect(4, 23, 14, 2, "g1");
	s.rect(2, 24, 3, 2, "g1");
	s.rect(17, 24, 3, 2, "g1");
	return s;
}

function plant(tall: boolean): Sprite {
	const h = tall ? 52 : 32;
	const s = new Sprite(26, h);
	const ph = tall ? 12 : 10;
	s.box(5, h - ph, 16, ph, "g4");
	s.hline(6, h - ph + 1, 14, "g6");
	s.rect(4, h - ph, 18, 2, "g5");
	s.frame(4, h - ph, 18, 2, "g0");
	s.rect(7, h - ph + 2, 12, 2, "soil");
	const r = Sprite.rng(h);
	const ri = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
	const blobs: [number, number, number][] = [[13, h - ph - 6, 7]];
	for (let i = 0; i < (tall ? 9 : 5); i++)
		blobs.push([ri(6, 20), ri(tall ? 4 : 6, h - ph - 4), ri(3, 5)]);
	for (const [x, y, rad] of blobs)
		for (let dy = -rad; dy <= rad; dy++)
			for (let dx = -rad; dx <= rad; dx++)
				if (dx * dx + dy * dy <= rad * rad && y + dy < h - ph + 1)
					s.px(x + dx, y + dy, dy > 0 ? "oliveD" : "olive");
	for (const [x, y, rad] of blobs)
		for (let dx = -rad + 1; dx < rad; dx++) s.px(x + dx, y - rad + 1, "oliveL");
	s.vline(13, tall ? 14 : 10, h - ph - 12, "oliveD");
	return s;
}

function sofa(): Sprite {
	const s = new Sprite(96, 40);
	s.box(0, 0, 96, 16, "g5");
	s.hline(1, 1, 94, "g7");
	s.box(0, 14, 10, 22, "g5");
	s.box(86, 14, 10, 22, "g5");
	s.hline(1, 15, 8, "g7");
	s.hline(87, 15, 8, "g7");
	for (let i = 0; i < 3; i++) {
		const x = 10 + i * 26;
		s.box(x, 14, 26, 14, "g4");
		s.hline(x + 1, 15, 24, "g6");
		s.box(x, 26, 26, 10, "g3");
		s.hline(x + 1, 27, 24, "g4");
	}
	s.rect(2, 36, 3, 4, "g1");
	s.rect(91, 36, 3, 4, "g1");
	s.rect(6, 36, 84, 2, "shadow");
	s.rect(14, 18, 8, 5, "rust");
	s.rect(14, 18, 8, 1, "rustD");
	return s;
}

function coffeeTable(): Sprite {
	const s = new Sprite(48, 26);
	s.box(0, 4, 48, 10, "g5");
	s.hline(1, 5, 46, "g7");
	s.box(0, 13, 48, 6, "g3");
	s.rect(2, 19, 3, 7, "g1");
	s.rect(43, 19, 3, 7, "g1");
	s.rect(6, 19, 36, 2, "shadow");
	s.rect(18, 1, 10, 4, "g10");
	s.frame(18, 1, 10, 4, "g8");
	s.rect(32, 2, 4, 3, "teal");
	return s;
}

function meetingTable(): Sprite {
	const s = new Sprite(128, 52);
	s.box(0, 8, 128, 26, "g5");
	s.hline(1, 9, 126, "g7");
	s.box(0, 33, 128, 10, "g3");
	s.hline(1, 34, 126, "g4");
	s.rect(4, 43, 4, 9, "g1");
	s.rect(120, 43, 4, 9, "g1");
	s.rect(8, 43, 112, 2, "shadow");
	for (const x of [24, 60, 96]) {
		s.box(x, 14, 12, 8, "g10");
		s.hline(x + 2, 17, 8, "g8");
		s.hline(x + 2, 19, 6, "g8");
	}
	s.rect(46, 24, 5, 5, "teal");
	s.rect(82, 24, 5, 5, "rust");
	return s;
}

function bookshelf(): Sprite {
	const s = new Sprite(48, 64);
	s.box(0, 0, 48, 64, "g4");
	s.hline(1, 1, 46, "g6");
	s.rect(0, 60, 48, 2, "g1");
	const r = Sprite.rng(7);
	const pick = <T>(list: T[]): T => list[Math.floor(r() * list.length)] as T;
	for (const y of [6, 20, 34, 48]) {
		s.rect(3, y, 42, 11, "g1");
		s.hline(3, y + 11, 42, "g5");
		let x = 4;
		while (x < 42) {
			const w = pick([2, 3, 3, 4]);
			const h = pick([7, 8, 9, 10]);
			const c = pick([
				"teal",
				"rust",
				"olive",
				"g8",
				"g9",
				"blue",
				"mauve",
				"gold",
				"g7",
			]);
			if (r() < 0.15) {
				x += 3;
				continue;
			}
			s.rect(x, y + 11 - h, w, h, c);
			if (w > 2) s.vline(x, y + 11 - h, h, "g0");
			x += w + (r() < 0.2 ? 1 : 0);
		}
	}
	return s;
}

function whiteboard(): Sprite {
	const s = new Sprite(64, 56);
	s.box(0, 0, 64, 42, "g7");
	s.rect(2, 2, 60, 38, "g11");
	s.rect(2, 2, 60, 1, "g10");
	for (const [y, w] of [
		[8, 30],
		[12, 22],
		[18, 36],
		[22, 14],
		[30, 26],
	] as const)
		s.rect(8, y, w, 1, "g8");
	s.rect(40, 24, 14, 10, "teal");
	s.frame(40, 24, 14, 10, "tealD");
	s.rect(44, 10, 10, 1, "rust");
	s.rect(0, 42, 64, 3, "g5");
	s.rect(10, 45, 2, 11, "g1");
	s.rect(52, 45, 2, 11, "g1");
	s.rect(6, 54, 10, 2, "g1");
	s.rect(48, 54, 10, 2, "g1");
	return s;
}

function waterCooler(): Sprite {
	const s = new Sprite(20, 50);
	s.box(3, 0, 14, 16, "paneL");
	s.rect(5, 2, 10, 12, "pane");
	s.rect(5, 2, 3, 12, "paneL");
	s.rect(5, 2, 10, 1, "g10");
	s.box(1, 15, 18, 30, "g4");
	s.hline(2, 16, 16, "g6");
	s.rect(4, 20, 12, 8, "g3");
	s.rect(6, 22, 3, 2, "blue");
	s.rect(11, 22, 3, 2, "rust");
	s.rect(1, 44, 18, 6, "g2");
	s.frame(1, 44, 18, 6, "g0");
	s.rect(3, 48, 14, 2, "shadow");
	return s;
}

function printer(): Sprite {
	const s = new Sprite(34, 28);
	s.box(2, 6, 30, 16, "g4");
	s.hline(3, 7, 28, "g6");
	s.box(6, 0, 22, 8, "g3");
	s.rect(8, 1, 18, 2, "g10");
	s.rect(4, 14, 26, 2, "g2");
	s.rect(8, 16, 18, 1, "g10");
	s.rect(24, 9, 4, 2, "olive");
	s.rect(0, 21, 34, 5, "g3");
	s.frame(0, 21, 34, 5, "g0");
	s.rect(2, 26, 30, 2, "shadow");
	return s;
}

function floorLamp(): Sprite {
	const s = new Sprite(18, 56);
	s.box(2, 0, 14, 12, "g9");
	s.rect(3, 1, 12, 10, "g10");
	s.rect(3, 11, 12, 1, "g11");
	s.rect(8, 12, 2, 36, "g6");
	s.px(8, 12, "g8");
	s.rect(2, 48, 14, 4, "g4");
	s.frame(2, 48, 14, 4, "g0");
	s.rect(4, 52, 10, 2, "shadow");
	return s;
}

function rug(w: number, h: number, accent: PaletteKey = "g4"): Sprite {
	const s = new Sprite(w, h);
	s.rect(0, 0, w, h, "g3");
	s.frame(0, 0, w, h, "g2");
	s.frame(2, 2, w - 4, h - 4, accent);
	s.frame(5, 5, w - 10, h - 10, "g2");
	return s;
}

function armchair(backView: boolean): Sprite {
	const s = new Sprite(30, 30);
	if (backView) {
		s.box(0, 8, 30, 16, "g5");
		s.box(3, 0, 24, 18, "tealD");
		s.hline(4, 1, 22, "teal");
		s.hline(4, 14, 22, "g2");
	} else {
		s.box(3, 0, 24, 13, "tealD");
		s.hline(4, 1, 22, "teal");
		s.box(0, 9, 7, 16, "g5");
		s.box(23, 9, 7, 16, "g5");
		s.hline(1, 10, 5, "g7");
		s.hline(24, 10, 5, "g7");
		s.box(6, 12, 18, 9, "teal");
		s.hline(7, 13, 16, "g9");
		s.box(6, 20, 18, 5, "g3");
	}
	s.rect(2, 24, 3, 4, "g1");
	s.rect(25, 24, 3, 4, "g1");
	s.rect(5, 26, 20, 2, "shadow");
	return s;
}

function diningTable(): Sprite {
	const s = new Sprite(64, 36);
	s.box(0, 4, 64, 18, "g6");
	s.hline(1, 5, 62, "g8");
	s.box(0, 21, 64, 6, "g4");
	s.rect(3, 27, 3, 9, "g1");
	s.rect(58, 27, 3, 9, "g1");
	s.rect(7, 27, 50, 2, "shadow");
	for (const x of [10, 44]) {
		s.box(x, 8, 10, 8, "g10");
		s.rect(x + 3, 10, 4, 4, "g11");
	}
	s.box(28, 9, 8, 6, "rust");
	s.rect(30, 9, 4, 2, "gold");
	return s;
}

function tvScreen(): Sprite {
	const s = new Sprite(72, 42);
	s.box(0, 0, 72, 42, "g1");
	s.rect(3, 3, 66, 34, "pane");
	s.rect(8, 8, 28, 3, "screen");
	s.rect(8, 14, 40, 2, "paneL");
	s.rect(8, 19, 32, 2, "paneL");
	s.rect(48, 25, 4, 9, "teal");
	s.rect(54, 20, 4, 14, "gold");
	s.rect(60, 28, 4, 6, "rust");
	s.rect(33, 38, 6, 2, "g5");
	return s;
}

function fridge(): Sprite {
	const s = new Sprite(30, 62);
	s.box(0, 0, 30, 58, "g8");
	s.hline(1, 1, 28, "g10");
	s.hline(1, 20, 28, "g6");
	s.rect(24, 6, 2, 10, "g5");
	s.rect(24, 25, 2, 18, "g5");
	s.rect(6, 30, 3, 3, "rust");
	s.rect(11, 34, 3, 3, "gold");
	s.rect(7, 40, 5, 4, "g11");
	s.rect(2, 58, 3, 4, "g1");
	s.rect(25, 58, 3, 4, "g1");
	s.rect(4, 58, 22, 2, "shadow");
	return s;
}

function pingPong(): Sprite {
	const s = new Sprite(96, 54);
	s.box(0, 6, 96, 32, "tealD");
	s.hline(1, 7, 94, "teal");
	s.hline(2, 22, 92, "g9");
	s.rect(46, 2, 4, 36, "g9");
	s.vline(47, 3, 34, "g11");
	s.box(0, 37, 96, 6, "g3");
	s.rect(6, 43, 3, 11, "g1");
	s.rect(87, 43, 3, 11, "g1");
	s.rect(10, 43, 76, 2, "shadow");
	s.box(16, 12, 7, 7, "rust");
	s.box(74, 26, 7, 7, "rust");
	s.rect(60, 14, 2, 2, "g11");
	return s;
}

function door(): Sprite {
	const s = new Sprite(32, 56);
	s.box(0, 0, 32, 56, "g6");
	s.box(3, 3, 26, 53, "g4");
	s.rect(6, 8, 20, 18, "g3");
	s.frame(6, 8, 20, 18, "g5");
	s.rect(6, 30, 20, 20, "g3");
	s.frame(6, 30, 20, 20, "g5");
	s.rect(22, 28, 3, 2, "g10");
	return s;
}

function window(): Sprite {
	const s = new Sprite(64, 44);
	s.box(0, 0, 64, 44, "g7");
	s.rect(2, 2, 60, 40, "pane");
	s.rect(2, 2, 60, 2, "paneL");
	const r = Sprite.rng(3);
	for (let bx = 4; bx < 60; bx += 6) {
		const bh = 8 + Math.floor(r() * 15);
		s.rect(bx, 42 - bh, 5, bh, "g1");
		for (let wy = 44 - bh; wy < 40; wy += 3)
			for (let wx = bx + 1; wx < bx + 5; wx += 2)
				if (r() < 0.5) s.px(wx, wy, r() < 0.3 ? "gold" : "g9");
	}
	s.rect(31, 2, 2, 40, "g7");
	s.rect(2, 21, 60, 2, "g7");
	s.rect(0, 42, 64, 2, "g8");
	return s;
}

function bracketLogo(): Sprite {
	const s = new Sprite(52, 36);
	for (const [x0, flip] of [
		[0, false],
		[36, true],
	] as const) {
		s.rect(x0, 0, 16, 36, "g11");
		s.hline(x0, 0, 16, "g9");
		s.hline(x0, 35, 16, "g8");
		for (let y = 8; y < 28; y++)
			for (let x = flip ? x0 : x0 + 8; x < (flip ? x0 + 8 : x0 + 16); x++)
				s.data.fill(0, (y * s.w + x) * 4, (y * s.w + x) * 4 + 4);
	}
	return s;
}

function poster(): Sprite {
	const s = new Sprite(24, 32);
	s.box(0, 0, 24, 32, "g9");
	s.rect(2, 2, 20, 28, "g1");
	s.rect(5, 6, 6, 10, "g11");
	s.rect(13, 6, 6, 10, "g11");
	s.rect(7, 8, 4, 6, "g1");
	s.rect(13, 8, 4, 6, "g1");
	s.rect(5, 20, 14, 2, "g8");
	s.rect(5, 24, 9, 2, "g8");
	return s;
}

function clock(): Sprite {
	const s = new Sprite(16, 16);
	s.box(0, 0, 16, 16, "g10");
	s.rect(2, 2, 12, 12, "g11");
	s.rect(7, 4, 2, 4, "g1");
	s.rect(7, 7, 5, 2, "g1");
	return s;
}

function kitchenCounter(): Sprite {
	const s = new Sprite(96, 44);
	s.box(0, 10, 96, 12, "g9");
	s.hline(1, 11, 94, "g11");
	s.box(0, 21, 96, 18, "g4");
	s.hline(1, 22, 94, "g6");
	for (let x = 2; x < 96; x += 24) {
		s.rect(x + 1, 24, 22, 13, "g3");
		s.frame(x + 1, 24, 22, 13, "g2");
		s.rect(x + 10, 30, 4, 1, "g8");
	}
	s.rect(0, 39, 96, 5, "g2");
	s.rect(2, 42, 92, 2, "shadow");
	s.box(10, 2, 20, 10, "g3");
	s.rect(12, 4, 16, 2, "g1");
	s.rect(14, 8, 4, 2, "rust");
	s.rect(60, 4, 8, 7, "g11");
	s.rect(60, 4, 8, 1, "g9");
	s.rect(70, 6, 6, 5, "teal");
	s.rect(78, 7, 5, 4, "gold");
	return s;
}

function stool(): Sprite {
	const s = new Sprite(16, 22);
	s.box(1, 0, 14, 8, "g5");
	s.hline(2, 1, 12, "g7");
	s.rect(7, 8, 2, 10, "g6");
	s.rect(3, 18, 10, 2, "g1");
	s.rect(4, 20, 8, 2, "shadow");
	return s;
}

function phoneBooth(): Sprite {
	const s = new Sprite(40, 72);
	s.box(0, 0, 40, 72, "g5");
	s.hline(1, 1, 38, "g7");
	s.rect(3, 3, 34, 64, "g3");
	s.rect(6, 8, 28, 30, "pane");
	s.frame(6, 8, 28, 30, "paneL");
	s.rect(8, 10, 8, 26, "paneL");
	s.rect(12, 44, 16, 6, "g5");
	s.rect(14, 46, 12, 2, "g7");
	s.rect(4, 66, 32, 3, "g1");
	s.rect(2, 70, 36, 2, "shadow");
	s.rect(17, 3, 6, 2, "olive");
	return s;
}

export const PROPS: Record<string, Prop> = {
	"desk-front": { draw: () => desk(true), footprint: 36 },
	"desk-back": { draw: () => desk(false), footprint: 36 },
	"chair-back": { draw: () => chair(true), footprint: 26 },
	"chair-front": { draw: () => chair(false), footprint: 26 },
	"plant-small": { draw: () => plant(false), footprint: 14 },
	"plant-tall": { draw: () => plant(true), footprint: 14 },
	sofa: { draw: sofa, footprint: 30 },
	"coffee-table": { draw: coffeeTable, footprint: 20 },
	"meeting-table": { draw: meetingTable, footprint: 44 },
	bookshelf: { draw: bookshelf, footprint: 20 },
	whiteboard: { draw: whiteboard, footprint: 16 },
	"water-cooler": { draw: waterCooler, footprint: 16 },
	printer: { draw: printer, footprint: 14 },
	"floor-lamp": { draw: floorLamp, footprint: 8 },
	"rug-lounge": { draw: () => rug(128, 80), footprint: 0, flat: true },
	"rug-meeting": { draw: () => rug(176, 100), footprint: 0, flat: true },
	door: { draw: door, footprint: 0 },
	window: { draw: window, footprint: 0 },
	"logo-bracket": { draw: bracketLogo, footprint: 0 },
	poster: { draw: poster, footprint: 0 },
	clock: { draw: clock, footprint: 0 },
	"kitchen-counter": { draw: kitchenCounter, footprint: 34 },
	stool: { draw: stool, footprint: 10 },
	"phone-booth": { draw: phoneBooth, footprint: 72 },
	"armchair-front": { draw: () => armchair(false), footprint: 24 },
	"armchair-back": { draw: () => armchair(true), footprint: 24 },
	"dining-table": { draw: diningTable, footprint: 28 },
	"tv-screen": { draw: tvScreen, footprint: 0 },
	fridge: { draw: fridge, footprint: 18 },
	"ping-pong": { draw: pingPong, footprint: 44 },
	"rug-lobby": { draw: () => rug(224, 128, "rustD"), footprint: 0, flat: true },
	"rug-studio": {
		draw: () => rug(176, 100, "tealD"),
		footprint: 0,
		flat: true,
	},
};

export const PROP_NAMES = Object.keys(PROPS);
