import type { Facing } from "../../../../utils/world";
import type { Look } from "./look";

export type Vec3 = [number, number, number];

/** An axis-aligned block in model units, hung from a pivot and swung about the x axis. */
export interface Block {
	pivot: Vec3;
	offset: Vec3;
	size: Vec3;
	swing: number;
	color: string;
	grid?: boolean;
}

export type Pose = "idle" | "walk" | "sit";

const HEAD = 8;
const TORSO_W = 8;
const TORSO_H = 9;
const TORSO_D = 4;
const ARM = 2;
const ARM_LEN = 8;
const LEG_W = 3;
const THIGH = 4;
const SHIN = 4;
const SHOE_LEN = 4;

export const STANDING_UNITS = THIGH + SHIN + TORSO_H + HEAD;

export const YAW: Record<Facing, number> = {
	down: 0,
	right: Math.PI / 2,
	up: Math.PI,
	left: -Math.PI / 2,
};

const deg = (d: number) => (d * Math.PI) / 180;

export function buildPose(look: Look, pose: Pose, t: number): Block[] {
	const blocks: Block[] = [];
	const seated = pose === "sit";
	const phase = t * Math.PI * 2;
	const legSwing = pose === "walk" ? deg(32) * Math.sin(phase) : 0;
	const armSwing = pose === "walk" ? deg(24) * Math.sin(phase) : 0;
	const bob =
		pose === "walk"
			? Math.abs(Math.sin(phase)) * 0.5
			: pose === "idle"
				? 0.25 * (1 - Math.cos(phase))
				: 0;
	const hipY = (seated ? SHIN : THIGH + SHIN) + bob;

	const leg = (x: number, swingSign: number) => {
		const hip: Vec3 = [x, hipY, 0];
		const thighSwing = seated ? deg(-90) : legSwing * swingSign;
		const kneeBend = pose === "walk" && thighSwing < 0 ? deg(25) : 0;
		const shinSwing = seated ? deg(90) : kneeBend;
		blocks.push({
			pivot: hip,
			offset: [0, -THIGH / 2, 0],
			size: [LEG_W, THIGH, LEG_W],
			swing: thighSwing,
			color: look.trousers,
			grid: true,
		});
		const knee = swingPoint(hip, [0, -THIGH, 0], thighSwing);
		const shinAngle = thighSwing + shinSwing;
		blocks.push({
			pivot: knee,
			offset: [0, -SHIN / 2, 0],
			size: [LEG_W, SHIN, LEG_W],
			swing: shinAngle,
			color: look.trousers,
			grid: true,
		});
		blocks.push({
			pivot: knee,
			offset: [0, -SHIN + 0.5, (SHOE_LEN - LEG_W) / 2],
			size: [LEG_W, 1, SHOE_LEN],
			swing: shinAngle,
			color: look.shoes,
		});
	};
	leg(-2, 1);
	leg(2, -1);

	const torsoBase: Vec3 = [0, hipY, 0];
	blocks.push({
		pivot: torsoBase,
		offset: [0, TORSO_H / 2, 0],
		size: [TORSO_W, TORSO_H, TORSO_D],
		swing: 0,
		color: look.top,
		grid: true,
	});
	if (look.accent) {
		blocks.push({
			pivot: torsoBase,
			offset: [0, TORSO_H - 2.5, TORSO_D / 2 + 0.15],
			size: [1, 4, 0.3],
			swing: 0,
			color: look.accent,
		});
	}

	const shoulderY = hipY + TORSO_H - 1;
	const arm = (x: number, swingSign: number) => {
		const shoulder: Vec3 = [x, shoulderY, 0];
		const swing = seated ? deg(-50) : armSwing * swingSign;
		blocks.push({
			pivot: shoulder,
			offset: [0, -ARM_LEN / 2 + 1, 0],
			size: [ARM, ARM_LEN, ARM],
			swing,
			color: look.top,
		});
		blocks.push({
			pivot: shoulder,
			offset: [0, -ARM_LEN + 0.5, 0],
			size: [ARM, 1.5, ARM],
			swing,
			color: look.skin,
		});
	};
	arm(-(TORSO_W / 2 + ARM / 2), -1);
	arm(TORSO_W / 2 + ARM / 2, 1);

	const neckY = hipY + TORSO_H;
	const headPivot: Vec3 = [0, neckY, 0];
	blocks.push({
		pivot: headPivot,
		offset: [0, HEAD / 2, 0],
		size: [HEAD, HEAD, HEAD],
		swing: 0,
		color: look.skin,
		grid: true,
	});
	for (const x of [-2, 2]) {
		blocks.push({
			pivot: headPivot,
			offset: [x, HEAD / 2 + 0.5, HEAD / 2 + 0.1],
			size: [1.2, 1.2, 0.2],
			swing: 0,
			color: "#1a1a1a",
		});
	}
	blocks.push(...hair(look, headPivot));
	return blocks;
}

function hair(look: Look, pivot: Vec3): Block[] {
	const h = look.hair;
	const cap = (height: number, extra = 0.3): Block => ({
		pivot,
		offset: [0, HEAD - height / 2 + extra, 0],
		size: [HEAD + 0.6, height, HEAD + 0.6],
		swing: 0,
		color: h,
		grid: true,
	});
	const back = (height: number): Block => ({
		pivot,
		offset: [0, HEAD - height / 2, -(HEAD / 2) - 0.3],
		size: [HEAD + 0.6, height, 1.2],
		swing: 0,
		color: h,
	});
	switch (look.hairStyle) {
		case "bald":
			return [];
		case "short":
			return [cap(2.5), back(5)];
		case "curly":
			return [cap(3.5, 0.8), back(6)];
		case "long":
			return [cap(2.5), back(9.5)];
		case "bun":
			return [
				cap(2.2),
				back(5),
				{
					pivot,
					offset: [0, HEAD + 0.5, -(HEAD / 2) - 1],
					size: [3, 3, 3],
					swing: 0,
					color: h,
				},
			];
		case "cap":
			return [
				{ ...cap(2.6, 0.6), color: look.accent ?? "#2a2a2a" },
				{
					pivot,
					offset: [0, HEAD + 0.1, HEAD / 2 + 1.5],
					size: [HEAD + 0.6, 0.6, 3.5],
					swing: 0,
					color: look.accent ?? "#2a2a2a",
				},
				back(4),
			];
	}
}

function swingPoint(pivot: Vec3, offset: Vec3, swing: number): Vec3 {
	const cos = Math.cos(swing);
	const sin = Math.sin(swing);
	const [x, y, z] = offset;
	return [
		pivot[0] + x,
		pivot[1] + y * cos - z * sin,
		pivot[2] + y * sin + z * cos,
	];
}
