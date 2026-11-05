import type { Block, Vec3 } from "./model";

export interface Camera {
	/** Angle the camera looks down from horizontal, radians. */
	pitch: number;
	/** Model rotation about the vertical axis, radians; 0 faces the viewer. */
	yaw: number;
	/** Pixels per model unit. */
	unit: number;
	/** Screen position of the model origin (feet, centred). */
	originX: number;
	originY: number;
}

interface Face {
	points: { x: number; y: number }[];
	depth: number;
	color: string;
	gridU: { x: number; y: number } | null;
	gridV: { x: number; y: number } | null;
	gridSize: [number, number] | null;
}

const LIGHT: Vec3 = normalize([0.35, 1, 0.75]);

/** Corner index = (x>0) + 2*(y>0) + 4*(z>0); each face lists p0, p0+u, p0+u+v, p0+v. */
const FACE_CORNERS: [number, number, number, number][] = [
	[1, 5, 7, 3],
	[0, 4, 6, 2],
	[2, 3, 7, 6],
	[0, 1, 5, 4],
	[4, 5, 7, 6],
	[0, 1, 3, 2],
];
const FACE_NORMALS: Vec3[] = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1],
];

export function drawBlocks(
	ctx: CanvasRenderingContext2D,
	blocks: Block[],
	camera: Camera,
): void {
	const faces: Face[] = [];
	const view: Vec3 = [0, Math.sin(camera.pitch), Math.cos(camera.pitch)];
	for (const block of blocks) {
		const corners = blockCorners(block).map((c) => rotateYaw(c, camera.yaw));
		const projected = corners.map((c) => project(c, camera));
		FACE_CORNERS.forEach((indices, faceIndex) => {
			const localNormal = FACE_NORMALS[faceIndex] as Vec3;
			const normal = rotateYaw(
				rotateSwing(localNormal, block.swing),
				camera.yaw,
			);
			if (dot(normal, view) <= 0.001) return;
			const points = indices.map(
				(i) => projected[i] as { x: number; y: number },
			);
			const depth =
				indices.reduce(
					(sum, i) => sum + depthOf(corners[i] as Vec3, camera),
					0,
				) / 4;
			const shade = 0.5 + 0.5 * Math.max(0, dot(normal, LIGHT));
			const edges = gridEdges(block, faceIndex, points);
			faces.push({
				points,
				depth,
				color: shadeColor(block.color, shade),
				gridU: edges?.u ?? null,
				gridV: edges?.v ?? null,
				gridSize: edges?.size ?? null,
			});
		});
	}
	faces.sort((a, b) => a.depth - b.depth);
	for (const face of faces) {
		ctx.beginPath();
		face.points.forEach((p, i) => {
			if (i === 0) ctx.moveTo(p.x, p.y);
			else ctx.lineTo(p.x, p.y);
		});
		ctx.closePath();
		ctx.fillStyle = face.color;
		ctx.fill();
		ctx.strokeStyle = "rgba(0,0,0,0.18)";
		ctx.lineWidth = 1;
		ctx.stroke();
		if (face.gridU && face.gridV && face.gridSize) {
			const origin = face.points[0] as { x: number; y: number };
			ctx.strokeStyle = "rgba(0,0,0,0.09)";
			for (let i = 1; i < face.gridSize[0]; i++) {
				ctx.beginPath();
				ctx.moveTo(origin.x + face.gridU.x * i, origin.y + face.gridU.y * i);
				ctx.lineTo(
					origin.x + face.gridU.x * i + face.gridV.x * face.gridSize[1],
					origin.y + face.gridU.y * i + face.gridV.y * face.gridSize[1],
				);
				ctx.stroke();
			}
			for (let i = 1; i < face.gridSize[1]; i++) {
				ctx.beginPath();
				ctx.moveTo(origin.x + face.gridV.x * i, origin.y + face.gridV.y * i);
				ctx.lineTo(
					origin.x + face.gridV.x * i + face.gridU.x * face.gridSize[0],
					origin.y + face.gridV.y * i + face.gridU.y * face.gridSize[0],
				);
				ctx.stroke();
			}
		}
	}
}

function gridEdges(
	block: Block,
	faceIndex: number,
	points: { x: number; y: number }[],
): {
	u: { x: number; y: number };
	v: { x: number; y: number };
	size: [number, number];
} | null {
	if (!block.grid) return null;
	const [w, h, d] = block.size;
	const spans: [number, number] =
		faceIndex < 2 ? [d, h] : faceIndex < 4 ? [w, d] : [w, h];
	const [p0, p1, , p3] = points as [
		{ x: number; y: number },
		{ x: number; y: number },
		{ x: number; y: number },
		{ x: number; y: number },
	];
	const size: [number, number] = [Math.round(spans[0]), Math.round(spans[1])];
	if (size[0] < 2 && size[1] < 2) return null;
	return {
		u: { x: (p1.x - p0.x) / size[0], y: (p1.y - p0.y) / size[0] },
		v: { x: (p3.x - p0.x) / size[1], y: (p3.y - p0.y) / size[1] },
		size,
	};
}

function blockCorners(block: Block): Vec3[] {
	const [w, h, d] = block.size;
	const [ox, oy, oz] = block.offset;
	const corners: Vec3[] = [];
	for (const sz of [-1, 1])
		for (const sy of [-1, 1])
			for (const sx of [-1, 1]) {
				const local: Vec3 = [
					ox + (sx * w) / 2,
					oy + (sy * h) / 2,
					oz + (sz * d) / 2,
				];
				const swung = rotateSwing(local, block.swing);
				corners.push([
					block.pivot[0] + swung[0],
					block.pivot[1] + swung[1],
					block.pivot[2] + swung[2],
				]);
			}
	// index = sx + 2*sy + 4*sz with -1→0, 1→1
	return corners;
}

function rotateSwing(v: Vec3, swing: number): Vec3 {
	const cos = Math.cos(swing);
	const sin = Math.sin(swing);
	return [v[0], v[1] * cos - v[2] * sin, v[1] * sin + v[2] * cos];
}

function rotateYaw(v: Vec3, yaw: number): Vec3 {
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	return [v[0] * cos + v[2] * sin, v[1], -v[0] * sin + v[2] * cos];
}

function project(v: Vec3, camera: Camera): { x: number; y: number } {
	return {
		x: camera.originX + v[0] * camera.unit,
		y:
			camera.originY -
			(v[1] * Math.cos(camera.pitch) - v[2] * Math.sin(camera.pitch)) *
				camera.unit,
	};
}

function depthOf(v: Vec3, camera: Camera): number {
	return v[1] * Math.sin(camera.pitch) + v[2] * Math.cos(camera.pitch);
}

function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vec3): Vec3 {
	const len = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / len, v[1] / len, v[2] / len];
}

function shadeColor(hex: string, factor: number): string {
	const n = Number.parseInt(hex.slice(1), 16);
	const r = Math.round(((n >> 16) & 255) * factor);
	const g = Math.round(((n >> 8) & 255) * factor);
	const b = Math.round((n & 255) * factor);
	return `rgb(${r},${g},${b})`;
}
