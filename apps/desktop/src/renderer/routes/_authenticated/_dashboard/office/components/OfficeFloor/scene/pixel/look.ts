export type HairStyle = "short" | "long" | "bun" | "bald" | "cap" | "curly";

export interface Look {
	skin: string;
	hair: string;
	hairStyle: HairStyle;
	top: string;
	trousers: string;
	shoes: string;
	accent: string | null;
}

const SKIN = ["#f2d3b8", "#e0b48f", "#c68c5a", "#9c6a44", "#6f4a30", "#4a3222"];
const HAIR = ["#1a1a1a", "#3a2a1e", "#6b4a2e", "#2b2b2b", "#8c8c8c", "#d9d9d9"];
const HAIR_STYLES: HairStyle[] = [
	"short",
	"long",
	"bun",
	"bald",
	"cap",
	"curly",
];
const TOPS = ["#111111", "#2b2b2b", "#444444", "#8a8a8a", "#c9c9c9", "#ededed"];
const TROUSERS = ["#161616", "#2e2e2e", "#555555", "#9a9a9a"];
const SHOES = ["#0d0d0d", "#2a2a2a", "#d8d8d8"];
const ACCENTS = [
	"#3f8f8a",
	"#b0623a",
	"#7c8a4a",
	"#5c6f8f",
	"#8a6a8f",
	"#c7a23a",
];

function hashString(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash;
}

function pick<T>(list: T[], seed: number, slot: number): T {
	const index = (seed >>> (slot * 5)) % list.length;
	return list[index] as T;
}

/** Deterministic outfit for a teammate id, so a person keeps their look across restarts. */
export function lookFor(id: string): Look {
	const seed = hashString(id);
	const seed2 = hashString(`${id}:2`);
	const top = pick(TOPS, seed, 0);
	const trousers = pick(TROUSERS, seed, 1);
	return {
		skin: pick(SKIN, seed, 2),
		hair: pick(HAIR, seed, 3),
		hairStyle: pick(HAIR_STYLES, seed, 4),
		top,
		trousers: trousers === top ? pick(TROUSERS, seed2, 0) : trousers,
		shoes: pick(SHOES, seed2, 1),
		accent: seed2 % 3 === 0 ? null : pick(ACCENTS, seed2, 2),
	};
}

export function lookKey(look: Look): string {
	return [
		look.skin,
		look.hair,
		look.hairStyle,
		look.top,
		look.trousers,
		look.shoes,
		look.accent ?? "-",
	].join("|");
}
