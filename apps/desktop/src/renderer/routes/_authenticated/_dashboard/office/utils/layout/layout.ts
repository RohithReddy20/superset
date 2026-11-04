import type { Handoff, Room, Teammate } from "../../types";
import type { Tile } from "../iso";

export interface DeskSpot {
	teammateId: string;
	roomId: string;
	desk: Tile;
	seat: Tile;
	facing: "south" | "east";
}

export interface RoomBox {
	room: Room;
	origin: Tile;
	w: number;
	h: number;
	label: Tile;
}

export interface MeetingSpot {
	origin: Tile;
	w: number;
	h: number;
	seats: Tile[];
}

export interface FloorLayout {
	rooms: RoomBox[];
	desks: DeskSpot[];
	meeting: MeetingSpot;
	w: number;
	h: number;
	/** Where each teammate stands right now, after hand-offs and huddles. */
	positions: Map<string, Tile>;
}

const DESK_COLS = 2;
const GAP = 2;
const ROOM_PAD = 1;
const DESK_W = 2;
const DESK_H = 3;

function roomSize(memberCount: number): { w: number; h: number } {
	const cols = Math.min(DESK_COLS, Math.max(1, memberCount));
	const rows = Math.max(1, Math.ceil(memberCount / DESK_COLS));
	return { w: cols * DESK_W + ROOM_PAD * 2, h: rows * DESK_H + ROOM_PAD * 2 };
}

export function layoutFloor({
	rooms,
	teammates,
	handoffs,
}: {
	rooms: Room[];
	teammates: Teammate[];
	handoffs: Handoff[];
}): FloorLayout {
	const byId = new Map(teammates.map((t) => [t.id, t]));
	const seated = new Set<string>();
	const roomBoxes: RoomBox[] = [];
	const desks: DeskSpot[] = [];
	let cursorX = 0;
	let rowY = 0;
	let rowH = 0;
	const maxRowW = 14;

	for (const room of rooms.filter((r) => r.kind === "room")) {
		const members = room.members.filter(
			(id) => byId.has(id) && !seated.has(id),
		);
		const size = roomSize(members.length);
		if (cursorX > 0 && cursorX + size.w > maxRowW) {
			cursorX = 0;
			rowY += rowH + GAP;
			rowH = 0;
		}
		const origin = { x: cursorX, y: rowY };
		roomBoxes.push({
			room,
			origin,
			w: size.w,
			h: size.h,
			label: { x: origin.x, y: origin.y - 0.6 },
		});
		members.forEach((id, index) => {
			const col = index % DESK_COLS;
			const row = Math.floor(index / DESK_COLS);
			const desk = {
				x: origin.x + ROOM_PAD + col * DESK_W,
				y: origin.y + ROOM_PAD + row * DESK_H,
			};
			desks.push({
				teammateId: id,
				roomId: room.id,
				desk,
				seat: { x: desk.x + 0.5, y: desk.y + 1.4 },
				facing: "south",
			});
			seated.add(id);
		});
		cursorX += size.w + GAP;
		rowH = Math.max(rowH, size.h);
	}

	const floorW = Math.max(maxRowW, cursorX);
	const meeting: MeetingSpot = {
		origin: { x: floorW + GAP, y: 0 },
		w: 5,
		h: 4,
		seats: [
			{ x: floorW + GAP + 1.2, y: 1.2 },
			{ x: floorW + GAP + 3.2, y: 1.2 },
			{ x: floorW + GAP + 1.2, y: 2.6 },
			{ x: floorW + GAP + 3.2, y: 2.6 },
		],
	};

	const positions = new Map<string, Tile>();
	for (const spot of desks) positions.set(spot.teammateId, spot.seat);

	const open = handoffs.filter((h) => h.status === "working");
	const huddle = new Set<string>();
	for (const h of open) {
		const asker = desks.find((d) => d.teammateId === h.fromId);
		const target = byId.get(h.toId);
		if (!asker || !target) continue;
		if (target.presence === "focused" || target.presence === "in-meeting") {
			huddle.add(h.fromId);
			huddle.add(h.toId);
		}
	}
	[...huddle].slice(0, meeting.seats.length).forEach((id, index) => {
		const seat = meeting.seats[index];
		if (seat) positions.set(id, seat);
	});

	return {
		rooms: roomBoxes,
		desks,
		meeting,
		w: meeting.origin.x + meeting.w,
		h: rowY + rowH,
		positions,
	};
}
