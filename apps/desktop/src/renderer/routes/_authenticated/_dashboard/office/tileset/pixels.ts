import { PALETTE } from "./palette";

export type Rgba = [number, number, number, number];

/** A palette key or a #rrggbb colour. */
export type Color = string;

export function parseColor(color: Color): Rgba {
	const hex = (PALETTE as Record<string, string>)[color] ?? color;
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function shade(hex: string, amount: number): string {
	const [r, g, b] = parseColor(hex);
	const f = (v: number) =>
		Math.max(0, Math.min(255, Math.round(v + amount * 255)));
	return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** An RGBA pixel buffer with the few drawing calls pixel art needs. */
export class Sprite {
	readonly data: Uint8ClampedArray;

	constructor(
		readonly w: number,
		readonly h: number,
	) {
		this.data = new Uint8ClampedArray(w * h * 4);
	}

	px(x: number, y: number, color: Color): void {
		if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
		this.data.set(parseColor(color), (y * this.w + x) * 4);
	}

	rect(x: number, y: number, w: number, h: number, color: Color): void {
		const rgba = parseColor(color);
		const x0 = Math.max(0, x);
		const y0 = Math.max(0, y);
		const x1 = Math.min(this.w, x + w);
		const y1 = Math.min(this.h, y + h);
		for (let yy = y0; yy < y1; yy++)
			for (let xx = x0; xx < x1; xx++)
				this.data.set(rgba, (yy * this.w + xx) * 4);
	}

	hline(x: number, y: number, w: number, color: Color): void {
		this.rect(x, y, w, 1, color);
	}

	vline(x: number, y: number, h: number, color: Color): void {
		this.rect(x, y, 1, h, color);
	}

	box(
		x: number,
		y: number,
		w: number,
		h: number,
		fill: Color,
		outline: Color = "g0",
	) {
		this.rect(x, y, w, h, outline);
		this.rect(x + 1, y + 1, w - 2, h - 2, fill);
	}

	frame(x: number, y: number, w: number, h: number, color: Color): void {
		this.hline(x, y, w, color);
		this.hline(x, y + h - 1, w, color);
		this.vline(x, y, h, color);
		this.vline(x + w - 1, y, h, color);
	}

	/** Darkens what is already drawn, for soft contact shadows. */
	shadow(x: number, y: number, w: number, h: number, alpha = 90): void {
		for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++)
			for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
				const i = (yy * this.w + xx) * 4;
				const a = alpha / 255;
				this.data[i] = (this.data[i] ?? 0) * (1 - a);
				this.data[i + 1] = (this.data[i + 1] ?? 0) * (1 - a);
				this.data[i + 2] = (this.data[i + 2] ?? 0) * (1 - a);
				this.data[i + 3] = Math.max(this.data[i + 3] ?? 0, alpha);
			}
	}

	blit(src: Sprite, x: number, y: number): void {
		x = Math.round(x);
		y = Math.round(y);
		for (let sy = 0; sy < src.h; sy++) {
			const dy = y + sy;
			if (dy < 0 || dy >= this.h) continue;
			for (let sx = 0; sx < src.w; sx++) {
				const dx = x + sx;
				if (dx < 0 || dx >= this.w) continue;
				const si = (sy * src.w + sx) * 4;
				const sa = (src.data[si + 3] ?? 0) / 255;
				if (sa === 0) continue;
				const di = (dy * this.w + dx) * 4;
				const da = (this.data[di + 3] ?? 0) / 255;
				const oa = sa + da * (1 - sa);
				for (let c = 0; c < 3; c++) {
					const sc = src.data[si + c] ?? 0;
					const dc = this.data[di + c] ?? 0;
					this.data[di + c] = oa ? (sc * sa + dc * da * (1 - sa)) / oa : 0;
				}
				this.data[di + 3] = oa * 255;
			}
		}
	}

	mirrored(): Sprite {
		const out = new Sprite(this.w, this.h);
		for (let y = 0; y < this.h; y++)
			for (let x = 0; x < this.w; x++)
				out.data.set(
					this.data.subarray((y * this.w + x) * 4, (y * this.w + x) * 4 + 4),
					(y * this.w + (this.w - 1 - x)) * 4,
				);
		return out;
	}

	/** Deterministic small-integer noise for leaves and books. */
	static rng(seed: number): () => number {
		let s = seed >>> 0;
		return () => {
			s = (s + 0x6d2b79f5) >>> 0;
			let t = s;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}
}
