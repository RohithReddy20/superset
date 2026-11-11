import Phaser from "phaser";
import {
	PROPS,
	STANDING_PX,
	TILE,
	TILE_NAMES,
	tileStrip,
} from "../../../tileset";
import type { Mood, OfficeSnapshot, Teammate } from "../../../types";
import {
	emptyTeamZoneAt,
	type Facing,
	findPath,
	isWalkable,
	type PlacedRoom,
	type Point,
	pathHead,
	pathTail,
	roomAt,
	type Seat,
	type SeatTarget,
	type WorldLayout,
	type Zone,
} from "../../../utils/world";
import { WORLD } from "./assets";
import {
	lookFor,
	lookKey,
	renderCharacterSheet,
	SHEET,
	toCanvas,
} from "./pixel";

export interface ScenePayload {
	state: OfficeSnapshot;
	layout: WorldLayout;
	selectedId: string | null;
	/** The room whose panel is open; its area is outlined. */
	selectedRoomId?: string | null;
	/** What each person is doing, drawn on the character. */
	moods?: ReadonlyMap<string, Mood>;
	/** Someone new walks in from the door; false while the office is still loading, so nobody "arrives" then. */
	walkIns?: boolean;
	meId: string | null;
	/** Teammates picked on the floor for a group move or message. */
	picked: string[];
	/** False keeps everyone at their desk: no carrying people into other rooms. */
	canCarry?: boolean;
	/** Carrying only seats people in existing rooms: no new rooms on empty desks. */
	seatOnly?: boolean;
}

export interface ActorFrame {
	id: string;
	x: number;
	y: number;
	headY: number;
}

export interface SignFrame {
	id: string;
	x: number;
	y: number;
	/** The sign sits over the top of its area; otherwise it hangs under the point. */
	above: boolean;
}

export interface DropFrame {
	x: number;
	y: number;
	label: string;
	/** False when letting go only sends the carried people back to their seats. */
	accept: boolean;
}

export interface SceneFrame {
	actors: ActorFrame[];
	/** Name signs of the chat rooms, keyed by room id. */
	signs: SignFrame[];
	/** Names of the other areas (kitchen, meeting rooms), keyed by zone id. */
	labels: SignFrame[];
	/** What letting go would do, while teammates are carried. */
	drop: DropFrame | null;
	/** Teammates being carried right now. */
	carried: string[];
	zoom: number;
}

/** "everyone" frames the AI teammates, "whole" the whole floor, "free" is where you zoomed or dragged to. */
export type ViewMode = "everyone" | "whole" | "free";

export interface SceneView {
	mode: ViewMode;
	canZoomIn: boolean;
	canZoomOut: boolean;
}

export interface SceneCallbacks {
	onSelectTeammate: (id: string) => void;
	onSelectRoom: (id: string) => void;
	/** Asks for a new picked set; the owner sends the one it keeps back in the payload. */
	onPick: (ids: string[]) => void;
	/** `at` is where each one was put down, so they sit at the nearest free desk. */
	onMoveTeammates: (
		ids: string[],
		roomId: string,
		at: Map<string, Point>,
	) => void;
	/** Teammates were put down on desks with no room yet; they wait there for a name or a cancel. */
	onDropOnEmptyArea: (
		ids: string[],
		zoneId: string,
		at: Map<string, Point>,
	) => void;
	onFrame: (frame: SceneFrame) => void;
	onView: (view: SceneView) => void;
	onReady: (scene: OfficeScene) => void;
}

interface Actor {
	id: string;
	ai: boolean;
	character: string;
	sprite: Phaser.GameObjects.Sprite;
	position: Point;
	path: Point[];
	facing: Facing;
	seat: SeatTarget | null;
	manual: boolean;
	seated: boolean;
	carried: boolean;
	/** Pixels a second for the walk it is on; long walks go faster so none takes long. */
	speed: number;
	/** 0 to 1: fades in on arrival and out once it has left. */
	fade: number;
	/** Removed from the office: it walks to the door, then goes. */
	leaving: boolean;
	/** Its sprite's opacity before `fade`, set by its presence. */
	alpha: number;
}

/** A held mouse button: on the floor it drags the view (or, with Shift, a box); on a teammate it carries them. */
interface Press {
	x: number;
	y: number;
	world: Point;
	actorId: string | null;
	carry: boolean;
	additive: boolean;
	/** The view's centre when the press began, for dragging the view. */
	centerX: number;
	centerY: number;
	moved: boolean;
}

interface Carry {
	ids: string[];
	/** A room to move into, or empty desks (room null) to make a new room at. */
	target: { room: PlacedRoom | null; zone: Zone } | null;
	/** Everyone carried already sits in the room they are held over. */
	staying: boolean;
}

interface CameraPose {
	zoom: number;
	x: number;
	y: number;
}

const WALK_SPEED = 120;
/** No walk takes longer than this; a longer path is walked faster. */
const MAX_WALK_S = 2.6;
const FADE_IN_MS = 260;
const FADE_OUT_MS = 220;
const CAMERA_MS = 320;
const WHEEL_MS = 140;
const RESIZE_MS = 220;
/** A selected teammate closer than this to the edge of the view is brought into it. */
const EDGE_MARGIN = 72;
const SELECTED_ROOM_COLOR = 0xffffff;
const MOOD_COLORS: Record<Mood, number> = {
	idle: 0x8b95a7,
	working: 0xf5b942,
	"needs-you": 0xff7a45,
	done: 0x39d353,
	failed: 0xff4d4d,
	lost: 0x7b8494,
	reconnecting: 0x7b8494,
};
const LOST_TINT = 0x9aa3b2;
const STEP = 16;
const DIRECTIONS: Facing[] = ["down", "left", "right", "up"];
/** Seated sprites draw just after their chair, which sits a few pixels below their feet line. */
const SEATED_DEPTH_LIFT = 8;
/** Arriving this close to any seat sits you down on it; clicking this close to one walks you to it. */
const SEAT_SNAP = 12;
const SEAT_CLICK = 24;
const ZOOMS = [1, 1.5, 2, 2.5, 3];
/** Floor around the people when the view frames everyone, so their room shows too. */
const EVERYONE_MARGIN_TILES = 5;
const EVERYONE_MAX_ZOOM = 2;
const WHEEL_STEP = 80;
const FOLLOW_LERP = 0.2;
/** Pixels the pointer travels while held before a press becomes a drag. */
const DRAG_START = 5;
const PICK_COLOR = 0x5ec8ff;
const CARRY_GAP = 26;
/** How far from their desk someone new appears, and how far someone removed walks before they go. */
const ARRIVAL_WALK_PX = 280;
const LEAVE_WALK_PX = 200;
/** How much of a standing person's height shows when seated. */
const SEATED_SHARE = 0.66;
const ABOVE_ALL = 1e7;

export class OfficeScene extends Phaser.Scene {
	private readonly actors = new Map<string, Actor>();
	private readonly worldSize = {
		w: WORLD.cols * WORLD.tileSize,
		h: WORLD.rows * WORLD.tileSize,
	};
	private payload: ScenePayload | null = null;
	private keys: Record<Facing, Phaser.Input.Keyboard.Key[]> | null = null;
	private mode: ViewMode = "whole";
	private freeZoom = 1;
	/** Where the camera is going; it is there already unless a glide runs. */
	private pose: CameraPose = { zoom: 1, x: 0, y: 0 };
	private glide: { from: CameraPose; start: number; ms: number } | null = null;
	/** The camera stays on you after you walked with the arrow keys, until you drag or re-frame. */
	private walking = false;
	private framedPeople = "";
	private populated = false;
	private selectedId: string | null = null;
	private wheel = 0;
	private now = 0;
	private press: Press | null = null;
	private carry: Carry | null = null;
	private band: { from: Point; to: Point } | null = null;
	private floorMarks!: Phaser.GameObjects.Graphics;
	private moodMarks!: Phaser.GameObjects.Graphics;
	private bandMarks!: Phaser.GameObjects.Graphics;
	private readonly still = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	private readonly areaLabels = WORLD.map.zones.flatMap((zone) =>
		zone.label && zone.sign ? [{ id: zone.id, point: zone.sign }] : [],
	);

	constructor(private readonly callbacks: SceneCallbacks) {
		super("office");
	}

	create(): void {
		this.buildFloor();
		this.placeProps();
		this.floorMarks = this.add.graphics().setDepth(0.6);
		this.moodMarks = this.add.graphics().setDepth(ABOVE_ALL - 2);
		this.bandMarks = this.add.graphics().setDepth(ABOVE_ALL);

		const keyboard = this.input.keyboard;
		if (keyboard) {
			keyboard.clearCaptures();
			const K = Phaser.Input.Keyboard.KeyCodes;
			this.keys = {
				up: [keyboard.addKey(K.UP, false), keyboard.addKey(K.W, false)],
				down: [keyboard.addKey(K.DOWN, false), keyboard.addKey(K.S, false)],
				left: [keyboard.addKey(K.LEFT, false), keyboard.addKey(K.A, false)],
				right: [keyboard.addKey(K.RIGHT, false), keyboard.addKey(K.D, false)],
			};
		}

		this.input.on(
			"pointerdown",
			(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) =>
				this.onPress(pointer, over),
		);
		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) =>
			this.onDrag(pointer),
		);
		this.input.on("pointerup", () => this.onRelease());
		this.input.on("pointerupoutside", () => this.onRelease());
		this.input.on(
			"wheel",
			(
				pointer: Phaser.Input.Pointer,
				_over: unknown,
				_dx: number,
				dy: number,
			) => {
				this.wheel += dy;
				if (Math.abs(this.wheel) < WHEEL_STEP) return;
				const anchor = { x: pointer.x, y: pointer.y };
				if (this.wheel < 0) this.zoomIn(anchor);
				else this.zoomOut(anchor);
				this.wheel = 0;
			},
		);
		this.scale.on("resize", () => this.frameCamera(true, RESIZE_MS));
		this.game.events.on(Phaser.Core.Events.POST_RENDER, this.emitFrame, this);
		this.events.once(Phaser.Scenes.Events.DESTROY, () =>
			this.game.events.off(
				Phaser.Core.Events.POST_RENDER,
				this.emitFrame,
				this,
			),
		);
		this.frameCamera(false);
		this.callbacks.onReady(this);
	}

	/** Floor and wall tiles from the Tiled map, drawn from the code tileset. */
	private buildFloor(): void {
		this.textures.addCanvas("floor-walls", toCanvas(tileStrip()));
		const rows: number[][] = [];
		for (let r = 0; r < WORLD.rows; r++)
			rows.push(
				WORLD.floor
					.slice(r * WORLD.cols, (r + 1) * WORLD.cols)
					.map((name) => TILE_NAMES.indexOf(name)),
			);
		const map = this.make.tilemap({
			data: rows,
			tileWidth: TILE,
			tileHeight: TILE,
		});
		const tiles = map.addTilesetImage(
			"floor-walls",
			"floor-walls",
			TILE,
			TILE,
			0,
			0,
		);
		if (tiles) map.createLayer(0, tiles, 0, 0)?.setDepth(0);
	}

	/** Every prop object from the Tiled map, drawn once per prop kind and layered by its base line. */
	private placeProps(): void {
		for (const placed of WORLD.props) {
			const prop = PROPS[placed.name];
			if (!prop) continue;
			const key = `prop-${placed.name}`;
			if (!this.textures.exists(key))
				this.textures.addCanvas(key, toCanvas(prop.draw()));
			this.add
				.image(placed.x, placed.y, key)
				.setOrigin(0, 1)
				.setDepth(prop.flat ? 0.5 : 1 + placed.y);
		}
	}

	/** Draws a teammate's sprite sheet on a canvas once and registers its frames and animations. */
	private characterTexture(id: string): string {
		const look = lookFor(id);
		const key = `pixel-${lookKey(look)}`;
		if (this.textures.exists(key)) return key;
		const canvas = renderCharacterSheet(look);
		const texture = this.textures.addCanvas(key, canvas);
		if (!texture) return key;
		const { cell, columns } = SHEET;
		for (let row = 0; row < 12; row++)
			for (let col = 0; col < columns; col++)
				texture.add(
					row * columns + col,
					0,
					col * cell.w,
					row * cell.h,
					cell.w,
					cell.h,
				);
		for (const kind of ["idle", "walk", "sit"] as const) {
			for (const facing of DIRECTIONS) {
				const start = SHEET.rows[kind][facing] * columns;
				this.anims.create({
					key: `${key}-${kind}-${facing}`,
					frames: this.anims.generateFrameNumbers(key, {
						start,
						end: start + SHEET.frames[kind] - 1,
					}),
					frameRate: kind === "walk" ? 12 : 3,
					repeat: -1,
				});
			}
		}
		return key;
	}

	setState(payload: ScenePayload): void {
		this.payload = payload;
		this.syncActors(payload);
		this.populated = true;
		if (this.mode === "everyone" && this.peopleKey() !== this.framedPeople)
			this.frameCamera(true);
		if (payload.selectedId !== this.selectedId) {
			this.selectedId = payload.selectedId;
			this.bringIntoView(payload.selectedId);
		}
	}

	update(time: number, delta: number): void {
		this.now = time;
		this.readKeys();
		for (const actor of [...this.actors.values()]) this.step(actor, delta);
		this.moveCamera();
		this.drawMarks();
		this.drawMoods(time);
	}

	/** `anchor` is a point of the view, in canvas pixels, that stays where it is while zooming. */
	zoomIn(anchor?: Point): void {
		const next = ZOOMS.find((z) => z > this.pose.zoom + 0.01);
		if (next === undefined) return;
		this.zoomTo(next, anchor);
	}

	zoomOut(anchor?: Point): void {
		const smaller = ZOOMS.filter(
			(z) => z < this.pose.zoom - 0.01 && z > this.wholeZoom() + 0.01,
		).at(-1);
		if (smaller === undefined) this.showWholeOffice();
		else this.zoomTo(smaller, anchor);
	}

	showWholeOffice(): void {
		this.mode = "whole";
		this.walking = false;
		this.frameCamera(true);
	}

	/** Frames every AI teammate on the floor, close enough to read them; the whole office when nobody is here. */
	showEveryone(): void {
		this.mode = "everyone";
		this.walking = false;
		this.frameCamera(true);
	}

	/** Carrying started from outside the canvas, by a teammate's name tag; points are canvas pixels. */
	beginCarry(id: string): void {
		if (this.payload?.canCarry === false) return;
		if (this.actors.get(id)?.ai && !this.carry) this.pickUp(id);
	}

	carryToScreen(x: number, y: number): void {
		const point = this.cameras.main.getWorldPoint(x, y);
		this.carryTo({ x: point.x, y: point.y });
	}

	endCarry(): void {
		if (this.carry) this.drop();
	}

	/** Walks teammates back to their seats, for a move the office refused. */
	sendHome(ids: string[]): void {
		for (const id of ids) {
			const actor = this.actors.get(id);
			if (actor?.seat) this.walk(actor, actor.seat);
		}
	}

	private me(): Actor | null {
		const id = this.payload?.meId;
		return (id && this.actors.get(id)) || null;
	}

	private wholeZoom(): number {
		const view = this.scale.gameSize;
		return Math.min(
			view.width / this.worldSize.w,
			view.height / this.worldSize.h,
		);
	}

	private zoomTo(zoom: number, anchor?: Point): void {
		const view = this.scale.gameSize;
		const from = this.pose;
		const offset = anchor
			? { x: anchor.x - view.width / 2, y: anchor.y - view.height / 2 }
			: { x: 0, y: 0 };
		this.mode = "free";
		this.freeZoom = zoom;
		this.frameCamera(true, anchor ? WHEEL_MS : CAMERA_MS, {
			x: from.x + offset.x / from.zoom - offset.x / zoom,
			y: from.y + offset.y / from.zoom - offset.y / zoom,
		});
	}

	/**
	 * Works out where the camera belongs for the view mode and goes there, gliding when `animate`
	 * is set. A free view keeps its zoom, and its centre unless `center` gives a new one.
	 */
	private frameCamera(animate: boolean, ms = CAMERA_MS, center?: Point): void {
		const view = this.scale.gameSize;
		const { w, h } = this.worldSize;
		const whole = this.wholeZoom();
		const people = this.mode === "everyone" ? this.peopleBox() : null;
		let next: CameraPose;
		if (people)
			next = {
				zoom: Math.min(
					EVERYONE_MAX_ZOOM,
					Math.max(
						whole,
						Math.min(view.width / people.w, view.height / people.h),
					),
				),
				x: people.x + people.w / 2,
				y: people.y + people.h / 2,
			};
		else if (this.mode === "free")
			next = {
				zoom: Math.max(this.freeZoom, whole),
				x: center?.x ?? this.pose.x,
				y: center?.y ?? this.pose.y,
			};
		else next = { zoom: whole, x: w / 2, y: h / 2 };
		next = this.clampPose(next);
		const from = this.poseAt(this.now);
		this.pose = next;
		if (animate && !this.still && this.populated)
			this.glide = { from, start: this.now, ms };
		else {
			this.glide = null;
			this.applyPose(next);
		}
		this.reportView();
	}

	/** Keeps a centre inside the floor for its zoom; a floor smaller than the view is centred. */
	private clampPose(pose: CameraPose): CameraPose {
		const view = this.scale.gameSize;
		const { w, h } = this.worldSize;
		const halfW = view.width / pose.zoom / 2;
		const halfH = view.height / pose.zoom / 2;
		return {
			zoom: pose.zoom,
			x: halfW * 2 >= w ? w / 2 : Math.min(w - halfW, Math.max(halfW, pose.x)),
			y: halfH * 2 >= h ? h / 2 : Math.min(h - halfH, Math.max(halfH, pose.y)),
		};
	}

	private poseAt(now: number): CameraPose {
		const glide = this.glide;
		if (!glide) return { ...this.pose };
		const t = Math.min(1, (now - glide.start) / glide.ms);
		const eased = 0.5 - Math.cos(Math.PI * t) / 2;
		const mix = (a: number, b: number) => a + (b - a) * eased;
		return {
			zoom: mix(glide.from.zoom, this.pose.zoom),
			x: mix(glide.from.x, this.pose.x),
			y: mix(glide.from.y, this.pose.y),
		};
	}

	private applyPose(pose: CameraPose): void {
		const camera = this.cameras.main;
		camera.removeBounds();
		camera.setZoom(pose.zoom);
		camera.centerOn(pose.x, pose.y);
	}

	/** Runs a glide, and keeps the camera on you while you walk. */
	private moveCamera(): void {
		const me = this.me();
		if (this.walking && me && this.mode === "free" && !this.press?.moved) {
			this.pose = this.clampPose({
				zoom: this.pose.zoom,
				x: this.pose.x + (me.position.x - this.pose.x) * FOLLOW_LERP,
				y: this.pose.y + (me.position.y - this.pose.y) * FOLLOW_LERP,
			});
			if (!this.glide) this.applyPose(this.pose);
		}
		const glide = this.glide;
		if (!glide) return;
		this.applyPose(this.poseAt(this.now));
		if (this.now - glide.start >= glide.ms) this.glide = null;
	}

	/** Glides a free view to a teammate that is out of sight or at its edge. */
	private bringIntoView(id: string | null): void {
		const actor = id ? this.actors.get(id) : null;
		if (!actor || this.mode !== "free") return;
		const view = this.scale.gameSize;
		const point = actor.seat ?? actor.position;
		const halfW = view.width / this.pose.zoom / 2;
		const halfH = view.height / this.pose.zoom / 2;
		const margin = EDGE_MARGIN / this.pose.zoom;
		const inside =
			Math.abs(point.x - this.pose.x) < halfW - margin &&
			Math.abs(point.y - this.pose.y) < halfH - margin;
		if (inside) return;
		this.frameCamera(true, CAMERA_MS, point);
	}

	private reportView(): void {
		this.callbacks.onView({
			mode: this.mode,
			canZoomIn: this.pose.zoom < (ZOOMS.at(-1) as number) - 0.01,
			canZoomOut: this.pose.zoom > this.wholeZoom() + 0.01,
		});
	}

	private peopleKey(): string {
		return [...this.actors.values()]
			.filter((a) => a.ai && !a.leaving)
			.map((a) => a.id)
			.sort()
			.join();
	}

	private peopleBox(): { x: number; y: number; w: number; h: number } | null {
		this.framedPeople = this.peopleKey();
		const points = [...this.actors.values()]
			.filter((a) => a.ai && !a.leaving)
			.map((a) => a.seat ?? a.position);
		if (points.length === 0) return null;
		const margin = EVERYONE_MARGIN_TILES * TILE;
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);
		const x = Math.min(...xs) - margin;
		const y = Math.min(...ys) - margin;
		return {
			x,
			y,
			w: Math.max(...xs) + margin - x,
			h: Math.max(...ys) + margin - y,
		};
	}

	private onPress(
		pointer: Phaser.Input.Pointer,
		over: Phaser.GameObjects.GameObject[],
	): void {
		const camera = this.cameras.main;
		const hit = [...this.actors.values()].find(
			(a) => a.sprite === over[0] && !a.leaving,
		);
		const event = pointer.event as MouseEvent | undefined;
		const world = camera.getWorldPoint(pointer.x, pointer.y);
		this.press = {
			x: pointer.x,
			y: pointer.y,
			world: { x: world.x, y: world.y },
			actorId: hit?.id ?? null,
			carry: !!hit?.ai && this.payload?.canCarry !== false,
			additive: !!(event?.shiftKey || event?.metaKey || event?.ctrlKey),
			centerX: this.pose.x,
			centerY: this.pose.y,
			moved: false,
		};
	}

	private onDrag(pointer: Phaser.Input.Pointer): void {
		const press = this.press;
		if (!press || !pointer.isDown) return;
		const dx = pointer.x - press.x;
		const dy = pointer.y - press.y;
		if (!press.moved) {
			if (Math.hypot(dx, dy) < DRAG_START) return;
			press.moved = true;
			this.input.setDefaultCursor("grabbing");
			if (press.carry && press.actorId) this.pickUp(press.actorId);
			else if (!press.additive) {
				const zoom = this.cameras.main.zoom;
				const at = this.poseAt(this.now);
				this.glide = null;
				this.walking = false;
				this.mode = "free";
				this.freeZoom = zoom;
				this.pose = { zoom, x: at.x, y: at.y };
				press.centerX = at.x;
				press.centerY = at.y;
				this.reportView();
			}
		}
		const camera = this.cameras.main;
		const world = camera.getWorldPoint(pointer.x, pointer.y);
		if (this.carry) this.carryTo({ x: world.x, y: world.y });
		else if (press.additive)
			this.band = { from: press.world, to: { x: world.x, y: world.y } };
		else {
			this.pose = this.clampPose({
				zoom: this.pose.zoom,
				x: press.centerX - dx / this.pose.zoom,
				y: press.centerY - dy / this.pose.zoom,
			});
			this.applyPose(this.pose);
		}
	}

	private onRelease(): void {
		const press = this.press;
		this.press = null;
		if (!press) return;
		this.input.setDefaultCursor("");
		if (press.moved) {
			if (this.carry) this.drop();
			else if (this.band) this.pickInBand();
			return;
		}
		if (press.actorId) {
			this.clickTeammate(press.actorId, press.additive);
			return;
		}
		if (!press.additive && this.payload?.picked.length)
			this.callbacks.onPick([]);
		const layout = this.payload?.layout;
		const room = layout ? roomAt(layout, press.world) : null;
		if (room) this.callbacks.onSelectRoom(room.id);
	}

	private clickTeammate(id: string, additive: boolean): void {
		const actor = this.actors.get(id);
		const picked = this.payload?.picked ?? [];
		if (!actor?.ai) {
			this.callbacks.onSelectTeammate(id);
			return;
		}
		if (additive)
			this.callbacks.onPick(
				picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id],
			);
		else {
			this.callbacks.onSelectTeammate(id);
			this.callbacks.onPick([id]);
		}
	}

	/** Lifts the pressed teammate, and the rest of the picked group when they are part of it. */
	private pickUp(id: string): void {
		const picked = this.payload?.picked ?? [];
		const ids = picked.includes(id)
			? picked.filter((p) => this.actors.get(p)?.ai)
			: [id];
		if (!picked.includes(id)) this.callbacks.onPick([id]);
		for (const each of ids) {
			const actor = this.actors.get(each);
			if (!actor) continue;
			actor.carried = true;
			actor.path = [];
			actor.seated = false;
			actor.sprite.setDepth(ABOVE_ALL - 1);
			this.play(actor, "idle", "down");
		}
		this.carry = { ids, target: null, staying: false };
	}

	private carryTo(point: Point): void {
		const carry = this.carry;
		if (!carry) return;
		const columns = Math.ceil(Math.sqrt(carry.ids.length));
		carry.ids.forEach((id, i) => {
			const actor = this.actors.get(id);
			if (!actor) return;
			actor.position = {
				x: point.x + ((i % columns) - (columns - 1) / 2) * CARRY_GAP,
				y: point.y + Math.floor(i / columns) * CARRY_GAP * 0.8,
			};
			actor.sprite.setPosition(actor.position.x, actor.position.y);
		});
		const layout = this.payload?.layout;
		const room = layout ? roomAt(layout, point) : null;
		const empty =
			!room && layout && !this.payload?.seatOnly
				? emptyTeamZoneAt(layout, point)
				: null;
		carry.target = room
			? { room, zone: room.zone }
			: empty
				? { room: null, zone: empty }
				: null;
		const roomOf = new Map(
			(this.payload?.state.teammates ?? []).map((t) => [t.id, t.roomId]),
		);
		carry.staying =
			!!room && carry.ids.every((id) => roomOf.get(id) === room.id);
	}

	/** Puts carried teammates down: into another room, onto empty desks for a new room, or back to their seats. */
	private drop(): void {
		const carry = this.carry;
		this.carry = null;
		const payload = this.payload;
		if (!carry || !payload) return;
		if (carry.target && !carry.target.room) {
			for (const id of carry.ids) {
				const actor = this.actors.get(id);
				if (!actor) continue;
				actor.carried = false;
				this.settle(actor);
			}
			this.callbacks.onDropOnEmptyArea(
				carry.ids,
				carry.target.zone.id,
				this.positionsOf(carry.ids),
			);
			return;
		}
		const roomOf = new Map(
			payload.state.teammates.map((t) => [t.id, t.roomId]),
		);
		const target = carry.target?.room ?? null;
		const moving = target
			? carry.ids.filter((id) => roomOf.get(id) !== target.id)
			: [];
		for (const id of carry.ids) {
			const actor = this.actors.get(id);
			if (!actor) continue;
			actor.carried = false;
			this.settle(actor);
			if (!moving.includes(id) && actor.seat) this.walk(actor, actor.seat);
		}
		if (target && moving.length > 0)
			this.callbacks.onMoveTeammates(
				moving,
				target.id,
				this.positionsOf(moving),
			);
	}

	private positionsOf(ids: string[]): Map<string, Point> {
		const at = new Map<string, Point>();
		for (const id of ids) {
			const actor = this.actors.get(id);
			if (actor) at.set(id, { ...actor.position });
		}
		return at;
	}

	private pickInBand(): void {
		const band = this.band;
		this.band = null;
		if (!band) return;
		const left = Math.min(band.from.x, band.to.x);
		const right = Math.max(band.from.x, band.to.x);
		const top = Math.min(band.from.y, band.to.y);
		const bottom = Math.max(band.from.y, band.to.y);
		const inside = [...this.actors.values()]
			.filter(
				(a) =>
					a.ai &&
					!a.leaving &&
					a.position.x >= left &&
					a.position.x <= right &&
					a.position.y >= top &&
					a.position.y <= bottom,
			)
			.map((a) => a.id);
		const picked = this.payload?.picked ?? [];
		this.callbacks.onPick([...new Set([...picked, ...inside])]);
	}

	/** The open room's outline, rings under picked teammates, where a carried group would land, and the Shift-drag box. */
	private drawMarks(): void {
		const marks = this.floorMarks;
		marks.clear();
		const open = this.payload?.layout.rooms.find(
			(r) => r.id === this.payload?.selectedRoomId,
		)?.zone.rect;
		if (open) {
			marks
				.fillStyle(SELECTED_ROOM_COLOR, 0.05)
				.fillRect(open.x, open.y, open.w, open.h);
			marks
				.lineStyle(1.5, SELECTED_ROOM_COLOR, 0.45)
				.strokeRect(open.x, open.y, open.w, open.h);
		}
		const picked = new Set(this.payload?.picked ?? []);
		for (const actor of this.actors.values()) {
			if (!picked.has(actor.id) || actor.carried || actor.leaving) continue;
			const { x, y } = actor.position;
			marks.fillStyle(PICK_COLOR, 0.35).fillEllipse(x, y - 1, 28, 10);
			marks.lineStyle(1, PICK_COLOR, 0.9).strokeEllipse(x, y - 1, 28, 10);
		}
		const carry = this.carry;
		const target = carry && !carry.staying ? carry.target?.zone.rect : null;
		if (target) {
			marks
				.fillStyle(PICK_COLOR, 0.12)
				.fillRect(target.x, target.y, target.w, target.h);
			marks
				.lineStyle(2, PICK_COLOR, 0.9)
				.strokeRect(target.x, target.y, target.w, target.h);
		}
		this.bandMarks.clear();
		if (this.band) {
			const { from, to } = this.band;
			const x = Math.min(from.x, to.x);
			const y = Math.min(from.y, to.y);
			const w = Math.abs(to.x - from.x);
			const h = Math.abs(to.y - from.y);
			this.bandMarks.fillStyle(PICK_COLOR, 0.12).fillRect(x, y, w, h);
			this.bandMarks.lineStyle(1, PICK_COLOR, 0.9).strokeRect(x, y, w, h);
		}
	}

	/** A small sign beside each person's head for what they are doing; it moves only a little. */
	private drawMoods(time: number): void {
		const marks = this.moodMarks;
		marks.clear();
		const moods = this.payload?.moods;
		if (!moods) return;
		const beat = this.still ? 0 : Math.floor(time / 260);
		for (const actor of this.actors.values()) {
			const mood = moods.get(actor.id);
			if (!mood || mood === "idle" || actor.leaving) continue;
			const top =
				actor.position.y - STANDING_PX * (actor.seated ? SEATED_SHARE : 1);
			const bob = mood === "needs-you" && beat % 4 === 0 ? -1 : 0;
			drawMood(
				marks,
				mood,
				Math.round(actor.position.x + 7),
				Math.round(top) + bob,
				beat,
				actor.fade,
			);
		}
	}

	private emitFrame(): void {
		const camera = this.cameras.main;
		const view = camera.worldView;
		const toScreen = (p: Point) => ({
			x: (p.x - view.x) * camera.zoom,
			y: (p.y - view.y) * camera.zoom,
		});
		const actors: ActorFrame[] = [];
		for (const actor of this.actors.values()) {
			if (actor.leaving) continue;
			const feet = toScreen(actor.position);
			const bodyShare = actor.seated ? SEATED_SHARE : 1;
			const headY = feet.y - STANDING_PX * camera.zoom * bodyShare;
			actors.push({ id: actor.id, x: feet.x, y: feet.y, headY });
		}
		const signs: SignFrame[] = [];
		const roomZones = new Set<string>();
		for (const room of this.payload?.layout.rooms ?? []) {
			roomZones.add(room.zone.id);
			const { rect, sign } = room.zone;
			signs.push({
				id: room.id,
				...toScreen(sign ?? { x: rect.x + rect.w / 2, y: rect.y }),
				above: !sign,
			});
		}
		const labels = this.areaLabels
			.filter((label) => !roomZones.has(label.id))
			.map((label) => ({
				id: label.id,
				...toScreen(label.point),
				above: false,
			}));
		this.callbacks.onFrame({
			actors,
			signs,
			labels,
			drop: this.dropFrame(toScreen),
			carried: this.carry?.ids ?? [],
			zoom: camera.zoom,
		});
	}

	private dropFrame(toScreen: (p: Point) => Point): DropFrame | null {
		const carry = this.carry;
		if (!carry) return null;
		const target = carry.target;
		if (target && !carry.staying) {
			const { rect } = target.zone;
			return {
				...toScreen({ x: rect.x + rect.w / 2, y: rect.y }),
				label: target.room
					? `${this.payload?.seatOnly ? "Sit in" : "Move to"} ${target.room.name}`
					: "New room here",
				accept: true,
			};
		}
		const first = this.actors.get(carry.ids[0] ?? "");
		if (!first) return null;
		return {
			...toScreen({ x: first.position.x, y: first.position.y + 4 }),
			label: carry.ids.length > 1 ? "Back to their desks" : "Back to its desk",
			accept: false,
		};
	}

	private syncActors(payload: ScenePayload): void {
		const seen = new Set<string>();
		for (const teammate of payload.state.teammates) {
			seen.add(teammate.id);
			const target = payload.layout.targets.get(teammate.id) ?? null;
			let actor = this.actors.get(teammate.id);
			if (!actor) {
				if (!target) continue;
				const walksIn =
					this.populated &&
					!!payload.walkIns &&
					teammate.kind === "ai" &&
					!this.still;
				actor = this.spawn(teammate, target, walksIn);
				this.actors.set(teammate.id, actor);
			}
			if (actor.leaving) {
				actor.leaving = false;
				actor.sprite.setInteractive({ cursor: actor.ai ? "grab" : "pointer" });
				if (target) {
					actor.seat = target;
					this.walk(actor, target);
				}
			}
			const mood = payload.moods?.get(teammate.id);
			const away = teammate.presence === "away";
			actor.alpha = away ? 0.5 : teammate.paused ? 0.7 : 1;
			if (mood === "lost" || mood === "reconnecting")
				actor.sprite.setTint(LOST_TINT);
			else actor.sprite.clearTint();
			if (actor.carried) continue;
			const isMe = teammate.id === payload.meId;
			if (
				target &&
				!(isMe && actor.manual) &&
				(actor.seat?.x !== target.x || actor.seat?.y !== target.y)
			) {
				actor.seat = target;
				this.walk(actor, target);
			}
		}
		for (const [id, actor] of this.actors) {
			if (seen.has(id) || actor.leaving) continue;
			if (!this.walkOut(actor)) this.remove(id);
		}
	}

	/** Sends a teammate to a point along the floor; one that cannot get there is put there. */
	private walk(actor: Actor, to: Point): void {
		const layout = this.payload?.layout;
		const path = layout ? findPath(layout, actor.position, to) : [];
		if (path.length === 0) {
			this.placeAt(actor, to);
			return;
		}
		let length = 0;
		let from = actor.position;
		for (const point of path) {
			length += Math.hypot(point.x - from.x, point.y - from.y);
			from = point;
		}
		actor.path = path;
		actor.speed = Math.max(WALK_SPEED, length / MAX_WALK_S);
	}

	/** Starts a removed teammate walking a few steps towards the door; false when it cannot walk there. */
	private walkOut(actor: Actor): boolean {
		const layout = this.payload?.layout;
		if (this.still || !actor.ai || !layout || actor.carried) return false;
		const path = findPath(layout, actor.position, layout.map.spawn);
		if (path.length === 0) return false;
		actor.leaving = true;
		actor.seat = null;
		actor.sprite.disableInteractive();
		actor.path = pathHead(actor.position, path, LEAVE_WALK_PX);
		actor.speed = WALK_SPEED;
		return true;
	}

	private remove(id: string): void {
		this.actors.get(id)?.sprite.destroy();
		this.actors.delete(id);
	}

	/** Someone arriving appears a few steps from their desk, on the way from the door, and walks to it. */
	private spawn(
		teammate: Teammate,
		seat: SeatTarget,
		arriving: boolean,
	): Actor {
		const character = this.characterTexture(teammate.id);
		const { cell } = SHEET;
		const ai = teammate.kind === "ai";
		const sprite = this.add
			.sprite(0, 0, character, 0)
			.setOrigin(cell.feetX / cell.w, cell.feetY / cell.h)
			.setInteractive({ cursor: ai ? "grab" : "pointer" });
		const actor: Actor = {
			id: teammate.id,
			ai,
			character,
			sprite,
			position: { x: seat.x, y: seat.y },
			path: [],
			facing: seat.facing,
			seat,
			manual: false,
			seated: false,
			carried: false,
			speed: WALK_SPEED,
			fade: 1,
			leaving: false,
			alpha: 1,
		};
		const layout = this.payload?.layout;
		const way =
			arriving && layout ? findPath(layout, layout.map.spawn, seat) : [];
		if (!layout || way.length === 0) {
			this.placeAt(actor, seat);
			return actor;
		}
		const last = pathTail(layout.map.spawn, way, ARRIVAL_WALK_PX);
		actor.fade = 0;
		sprite.setAlpha(0);
		this.placeAt(actor, last.start);
		actor.path = last.path;
		return actor;
	}

	private placeAt(actor: Actor, point: Point): void {
		actor.path = [];
		actor.position = { x: point.x, y: point.y };
		actor.sprite.setPosition(point.x, point.y);
		this.settle(actor);
	}

	private settle(actor: Actor): void {
		const own =
			actor.seat &&
			actor.seat.x === actor.position.x &&
			actor.seat.y === actor.position.y
				? actor.seat
				: null;
		const seat =
			own ?? (actor.manual ? this.seatNear(actor.position, SEAT_SNAP) : null);
		if (seat) {
			if (own) actor.manual = false;
			actor.position = { x: seat.x, y: seat.y };
			actor.sprite.setPosition(seat.x, seat.y);
			actor.facing = seat.facing;
		}
		actor.seated = !!seat && !seat.standing;
		this.play(actor, actor.seated ? "sit" : "idle", actor.facing);
		this.layer(actor);
	}

	private seatNear(point: Point, within: number): Seat | null {
		let best: Seat | null = null;
		let bestDistance = within;
		for (const zone of this.payload?.layout.map.zones ?? [])
			for (const seat of zone.seats) {
				const distance = Math.hypot(seat.x - point.x, seat.y - point.y);
				if (distance <= bestDistance) {
					best = seat;
					bestDistance = distance;
				}
			}
		return best;
	}

	private play(actor: Actor, kind: "idle" | "walk" | "sit", facing: Facing) {
		actor.sprite.anims.play(`${actor.character}-${kind}-${facing}`, true);
	}

	private layer(actor: Actor): void {
		actor.sprite.setDepth(
			1 + actor.position.y + (actor.seated ? SEATED_DEPTH_LIFT : 0),
		);
	}

	private step(actor: Actor, delta: number): void {
		this.fade(actor, delta);
		const next = actor.path[0];
		if (!next || actor.carried) return;
		const dx = next.x - actor.position.x;
		const dy = next.y - actor.position.y;
		const distance = Math.hypot(dx, dy);
		const stepSize = (actor.speed * delta) / 1000;
		const facing: Facing =
			Math.abs(dx) > Math.abs(dy)
				? dx > 0
					? "right"
					: "left"
				: dy > 0
					? "down"
					: "up";
		actor.facing = facing;
		actor.seated = false;
		this.play(actor, "walk", facing);
		if (distance <= stepSize) {
			actor.position = { x: next.x, y: next.y };
			actor.path.shift();
			if (actor.path.length === 0) this.settle(actor);
		} else {
			actor.position = {
				x: actor.position.x + (dx / distance) * stepSize,
				y: actor.position.y + (dy / distance) * stepSize,
			};
		}
		actor.sprite.setPosition(actor.position.x, actor.position.y);
		this.layer(actor);
	}

	/** Fades an arrival in, and someone who reached the door out, then takes them off the floor. */
	private fade(actor: Actor, delta: number): void {
		const gone = actor.leaving && actor.path.length === 0;
		if (gone) actor.fade = Math.max(0, actor.fade - delta / FADE_OUT_MS);
		else if (actor.fade < 1)
			actor.fade = Math.min(1, actor.fade + delta / FADE_IN_MS);
		actor.sprite.setAlpha(actor.alpha * actor.fade);
		if (gone && actor.fade === 0) this.remove(actor.id);
	}

	private readKeys(): void {
		if (!this.keys || !this.payload?.meId) return;
		const me = this.actors.get(this.payload.meId);
		if (!me || me.path.length > 0) return;
		for (const facing of DIRECTIONS) {
			if (!this.keys[facing].some((key) => key.isDown)) continue;
			const next = {
				x:
					me.position.x +
					(facing === "right" ? STEP : facing === "left" ? -STEP : 0),
				y:
					me.position.y +
					(facing === "down" ? STEP : facing === "up" ? -STEP : 0),
			};
			me.manual = true;
			me.facing = facing;
			me.speed = WALK_SPEED;
			this.followWalk();
			const seat = this.seatNear(next, SEAT_CLICK);
			const ahead =
				seat &&
				Math.hypot(seat.x - next.x, seat.y - next.y) <
					Math.hypot(seat.x - me.position.x, seat.y - me.position.y);
			if (seat && ahead)
				me.path = findPath(this.payload.layout, me.position, seat);
			else if (isWalkable(this.payload.layout, next)) me.path = [next];
			else this.play(me, "idle", facing);
			return;
		}
	}

	/** Walking with the keys puts the camera on you, close enough to see where you go. */
	private followWalk(): void {
		if (this.walking) return;
		this.walking = true;
		if (this.mode !== "free") {
			this.mode = "free";
			this.freeZoom = Math.max(this.pose.zoom, ZOOMS[0] as number);
			this.frameCamera(true);
		}
	}
}

/** Pixel signs, drawn with their top-left corner at (x, y) in floor pixels. */
function drawMood(
	marks: Phaser.GameObjects.Graphics,
	mood: Mood,
	x: number,
	y: number,
	beat: number,
	alpha: number,
): void {
	const color = MOOD_COLORS[mood];
	const dots = mood === "working" || mood === "reconnecting";
	const w = dots ? 11 : 7;
	const h = dots ? 6 : 9;
	marks.fillStyle(0x14161a, 0.92 * alpha).fillRect(x, y + 1, w, h - 2);
	marks.fillRect(x + 1, y, w - 2, h);
	marks.fillStyle(color, alpha);
	const px = (dx: number, dy: number, pw = 1, ph = 1) =>
		marks.fillRect(x + dx, y + dy, pw, ph);
	if (dots) {
		for (let i = 0; i < 3; i++) px(2 + i * 3, beat % 4 === i ? 1 : 2, 2, 2);
		return;
	}
	if (mood === "needs-you") {
		px(3, 1, 1, 4);
		px(3, 7);
	} else if (mood === "done") {
		px(1, 4);
		px(2, 5);
		px(3, 4);
		px(4, 3);
		px(5, 2);
	} else if (mood === "failed") {
		for (let i = 0; i < 5; i++) {
			px(1 + i, 2 + i);
			px(5 - i, 2 + i);
		}
	} else {
		px(2, 2, 3, 1);
		px(4, 3);
		px(3, 4);
		px(2, 5);
		px(2, 6, 3, 1);
	}
}

export function createOfficeGame(
	parent: HTMLElement,
	callbacks: SceneCallbacks,
): Phaser.Game {
	return new Phaser.Game({
		type: Phaser.AUTO,
		parent,
		transparent: true,
		pixelArt: true,
		antialias: false,
		scale: {
			mode: Phaser.Scale.RESIZE,
			width: "100%",
			height: "100%",
		},
		input: { keyboard: { target: parent } },
		scene: new OfficeScene(callbacks),
	});
}
