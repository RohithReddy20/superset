import type { AgentStatus, CityBuildingSource } from "../../types";

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface CityWindow extends Rect {
	workspaceId: string;
	/** Null for a floor's empty window. */
	status: AgentStatus | null;
}

export interface CityBuilding {
	id: string;
	lot: Rect;
	body: Rect;
	floors: number;
	/** Workspaces with no floor of their own, past the tallest building the lot holds. */
	hiddenWorkspaces: number;
	windows: CityWindow[];
	/** Top centre of the roof, where the building's sign hangs. */
	roof: { x: number; y: number };
}

export interface CityLayout {
	w: number;
	h: number;
	buildings: CityBuilding[];
	roads: Rect[];
}

export const ROAD = 28;
export const SIDEWALK = 8;
export const LOT_W = 120;
/** Lawn above the tallest building, for trees and its sign. */
export const LOT_HEADROOM = 40;
export const BUILDING_W = 80;
export const GROUND_H = 26;
export const FLOOR_H = 22;
export const ROOF_H = 12;
export const MAX_FLOORS = 6;
export const WINDOWS_PER_FLOOR = 4;
export const WINDOW = { w: 12, h: 12, gap: 4, inset: 10 };

/** Places one building per project on a grid of lots, roads between them, oldest project first. */
export function layoutCity(projects: CityBuildingSource[]): CityLayout {
	const ordered = [...projects].sort(
		(a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
	);
	const count = Math.max(1, ordered.length);
	const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
	const rows = Math.ceil(count / cols);
	const tallest = Math.max(
		1,
		...ordered.map((p) => Math.min(MAX_FLOORS, p.workspaces.length)),
	);
	const lotH = buildingHeight(tallest) + SIDEWALK * 2 + LOT_HEADROOM;
	const w = ROAD + cols * (LOT_W + ROAD);
	const h = ROAD + rows * (lotH + ROAD);

	const roads: Rect[] = [];
	for (let r = 0; r <= rows; r++)
		roads.push({ x: 0, y: r * (lotH + ROAD), w, h: ROAD });
	for (let c = 0; c <= cols; c++)
		roads.push({ x: c * (LOT_W + ROAD), y: 0, w: ROAD, h });

	const buildings = ordered.map((project, index) => {
		const lot = {
			x: ROAD + (index % cols) * (LOT_W + ROAD),
			y: ROAD + Math.floor(index / cols) * (lotH + ROAD),
			w: LOT_W,
			h: lotH,
		};
		return placeBuilding(project, lot);
	});

	return { w, h, buildings, roads };
}

function placeBuilding(project: CityBuildingSource, lot: Rect): CityBuilding {
	const workspaces = [...project.workspaces].sort(
		(a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
	);
	const shown = workspaces.slice(0, MAX_FLOORS);
	const floors = Math.max(1, shown.length);
	const height = buildingHeight(floors);
	const body = {
		x: lot.x + Math.round((lot.w - BUILDING_W) / 2),
		y: lot.y + lot.h - SIDEWALK - height,
		w: BUILDING_W,
		h: height,
	};
	const groundTop = body.y + body.h - GROUND_H;
	const windows: CityWindow[] = [];
	shown.forEach((workspace, floor) => {
		const top = groundTop - (floor + 1) * FLOOR_H + (FLOOR_H - WINDOW.h) / 2;
		const agents = [...workspace.agents].sort(
			(a, b) => a.startedAt - b.startedAt,
		);
		for (let slot = 0; slot < WINDOWS_PER_FLOOR; slot++)
			windows.push({
				x: body.x + WINDOW.inset + slot * (WINDOW.w + WINDOW.gap),
				y: top,
				w: WINDOW.w,
				h: WINDOW.h,
				workspaceId: workspace.id,
				status: agents[slot]?.status ?? null,
			});
	});
	return {
		id: project.id,
		lot,
		body,
		floors,
		hiddenWorkspaces: workspaces.length - shown.length,
		windows,
		roof: { x: body.x + body.w / 2, y: body.y },
	};
}

function buildingHeight(floors: number): number {
	return ROOF_H + floors * FLOOR_H + GROUND_H;
}

export function buildingAt(
	layout: CityLayout,
	point: { x: number; y: number },
): CityBuilding | null {
	return (
		layout.buildings.find(
			(b) =>
				point.x >= b.body.x &&
				point.x < b.body.x + b.body.w &&
				point.y >= b.body.y &&
				point.y < b.body.y + b.body.h,
		) ?? null
	);
}
