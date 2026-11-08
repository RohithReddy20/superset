import Phaser from "phaser";
import {
	PROPS,
	STANDING_PX,
	TILE,
	TILE_NAMES,
	tileStrip,
} from "../../../tileset";
import type { OfficeSnapshot, Teammate } from "../../../types";
import {
	emptyTeamZoneAt,
	type Facing,
	findPath,
	isWalkable,
	type PlacedRoom,
	type Point,
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
	meId: string | null;
	/** Teammates picked on the floor for a group move or message. */
	picked: string[];
	/** False keeps everyone at their desk: no carrying people into other rooms. */
	canCarry?: boolean;
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
}

export interface SceneFrame {
	actors: ActorFrame[];
	/** Name signs of the chat rooms, keyed by room id. */
	signs: SignFrame[];
	/** Names of the other areas (kitchen, meeting rooms), keyed by zone id. */
	labels: SignFrame[];
	/** Where carried teammates would land, while they are carried over a room or empty desks. */
	drop: { x: number; y: number; label: string } | null;
	zoom: number;
}

export interface SceneView {
	/** The camera is on you; false while it shows the whole office or was dragged away. */
	following: boolean;
	canFollow: boolean;
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
}

/** A held mouse button: on the floor it drags the view (or, with Shift, a box); on a teammate it carries them. */
interface Press {
	x: number;
	y: number;
	world: Point;
	actorId: string | null;
	carry: boolean;
	additive: boolean;
	scrollX: number;
	scrollY: number;
	moved: boolean;
}

interface Carry {
	ids: string[];
	/** A room to move into, or empty desks (room null) to make a new room at. */
	target: { room: PlacedRoom | null; zone: Zone } | null;
}

const WALK_SPEED = 120;
const STEP = 16;
const DIRECTIONS: Facing[] = ["down", "left", "right", "up"];
/** Seated sprites draw just after their chair, which sits a few pixels below their feet line. */
const SEATED_DEPTH_LIFT = 8;
/** Arriving this close to any seat sits you down on it; clicking this close to one walks you to it. */
const SEAT_SNAP = 12;
const SEAT_CLICK = 24;
const ZOOMS = [1, 1.5, 2, 2.5, 3];
/** Rows of tiles the starting zoom aims to show, so people stay readable in any pane size. */
const VIEW_ROWS = 18;
const WHEEL_STEP = 80;
const FOLLOW_LERP = 0.2;
/** Pixels the pointer travels while held before a press becomes a drag. */
const DRAG_START = 5;
const DOUBLE_CLICK_MS = 350;
const DOUBLE_CLICK_SLOP = 8;
const RETURN_MS = 400;
const PICK_COLOR = 0x5ec8ff;
const CARRY_GAP = 26;
const ABOVE_ALL = 1e7;

export class OfficeScene extends Phaser.Scene {
	private readonly actors = new Map<string, Actor>();
	private readonly worldSize = {
		w: WORLD.cols * WORLD.tileSize,
		h: WORLD.rows * WORLD.tileSize,
	};
	private payload: ScenePayload | null = null;
	private keys: Record<Facing, Phaser.Input.Keyboard.Key[]> | null = null;
	private chosenZoom: number | null = null;
	private overview = false;
	private panned = false;
	private followed: Actor | null = null;
	private wheel = 0;
	private press: Press | null = null;
	private carry: Carry | null = null;
	private band: { from: Point; to: Point } | null = null;
	private lastClick = { time: 0, x: 0, y: 0 };
	private floorMarks!: Phaser.GameObjects.Graphics;
	private bandMarks!: Phaser.GameObjects.Graphics;
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
		this.input.on("pointerup", (pointer: Phaser.Input.Pointer) =>
			this.onRelease(pointer),
		);
		this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) =>
			this.onRelease(pointer),
		);
		this.input.on(
			"wheel",
			(_p: unknown, _over: unknown, _dx: number, dy: number) => {
				this.wheel += dy;
				if (Math.abs(this.wheel) < WHEEL_STEP) return;
				if (this.wheel < 0) this.zoomIn();
				else this.zoomOut();
				this.wheel = 0;
			},
		);
		this.scale.on("resize", () => this.frameCamera());
		this.game.events.on(Phaser.Core.Events.POST_RENDER, this.emitFrame, this);
		this.events.once(Phaser.Scenes.Events.DESTROY, () =>
			this.game.events.off(
				Phaser.Core.Events.POST_RENDER,
				this.emitFrame,
				this,
			),
		);
		this.frameCamera();
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
		if (this.me() !== this.followed) this.frameCamera();
	}

	update(_time: number, delta: number): void {
		this.readKeys();
		for (const actor of this.actors.values()) this.step(actor, delta);
		this.drawMarks();
	}

	zoomIn(): void {
		if (this.overview) {
			this.overview = false;
			this.panned = false;
		} else {
			const zoom = this.followZoom();
			this.chosenZoom = ZOOMS.find((z) => z > zoom) ?? zoom;
		}
		this.frameCamera();
	}

	zoomOut(): void {
		const zoom = this.followZoom();
		const smaller = ZOOMS.filter((z) => z < zoom).at(-1);
		if (smaller === undefined) {
			this.overview = true;
			this.panned = false;
		} else this.chosenZoom = smaller;
		this.frameCamera();
	}

	followMe(): void {
		this.overview = false;
		this.panned = false;
		this.frameCamera();
	}

	showWholeOffice(): void {
		this.overview = true;
		this.panned = false;
		this.frameCamera();
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
		const layout = this.payload?.layout;
		if (!layout) return;
		for (const id of ids) {
			const actor = this.actors.get(id);
			if (!actor?.seat) continue;
			actor.path = findPath(layout, actor.position, actor.seat);
		}
	}

	private me(): Actor | null {
		const id = this.payload?.meId;
		return (id && this.actors.get(id)) || null;
	}

	private followZoom(): number {
		if (this.chosenZoom !== null) return this.chosenZoom;
		const fits = this.scale.gameSize.height / (VIEW_ROWS * TILE);
		return ZOOMS.filter((z) => z <= fits).at(-1) ?? (ZOOMS[0] as number);
	}

	/**
	 * Follows you at a readable zoom. The overview, or nobody to follow, shows the whole office;
	 * after a drag the view stays where it was left, at the new zoom.
	 */
	private frameCamera(): void {
		const camera = this.cameras.main;
		const view = this.scale.gameSize;
		const { w, h } = this.worldSize;
		const me = this.me();
		const overview = this.overview || !me;
		const center = {
			x: camera.worldView.centerX,
			y: camera.worldView.centerY,
		};
		const zoom = overview
			? Math.min(view.width / w, view.height / h)
			: this.followZoom();
		camera.resetFX();
		camera.setZoom(zoom);
		const seenW = view.width / zoom;
		const seenH = view.height / zoom;
		camera.setBounds(
			Math.min(0, (w - seenW) / 2),
			Math.min(0, (h - seenH) / 2),
			Math.max(w, seenW),
			Math.max(h, seenH),
		);
		if (me && !overview && !this.panned)
			camera.startFollow(me.sprite, true, FOLLOW_LERP, FOLLOW_LERP);
		else {
			camera.stopFollow();
			if (this.panned) camera.centerOn(center.x, center.y);
			else camera.centerOn(w / 2, h / 2);
		}
		this.followed = me;
		this.reportView();
	}

	private reportView(): void {
		const me = this.me();
		const overview = this.overview || !me;
		this.callbacks.onView({
			following: !overview && !this.panned,
			canFollow: !!me,
			canZoomIn: overview || this.followZoom() < (ZOOMS.at(-1) as number),
			canZoomOut: !overview,
		});
	}

	/** Brings a dragged-away view back to you, then follows again. */
	private resumeFollow(): void {
		if (!this.panned) return;
		this.panned = false;
		const me = this.me();
		if (!me || this.overview) {
			this.frameCamera();
			return;
		}
		this.cameras.main.pan(
			me.position.x,
			me.position.y,
			RETURN_MS,
			"Sine.easeInOut",
			true,
			(_camera: Phaser.Cameras.Scene2D.Camera, progress: number) => {
				if (progress === 1 && !this.panned) this.frameCamera();
			},
		);
		this.reportView();
	}

	private onPress(
		pointer: Phaser.Input.Pointer,
		over: Phaser.GameObjects.GameObject[],
	): void {
		const camera = this.cameras.main;
		const hit = [...this.actors.values()].find((a) => a.sprite === over[0]);
		const event = pointer.event as MouseEvent | undefined;
		const world = camera.getWorldPoint(pointer.x, pointer.y);
		this.press = {
			x: pointer.x,
			y: pointer.y,
			world: { x: world.x, y: world.y },
			actorId: hit?.id ?? null,
			carry: !!hit?.ai && this.payload?.canCarry !== false,
			additive: !!(event?.shiftKey || event?.metaKey || event?.ctrlKey),
			scrollX: camera.scrollX,
			scrollY: camera.scrollY,
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
				this.panned = true;
				this.cameras.main.resetFX();
				this.cameras.main.stopFollow();
				this.reportView();
			}
		}
		const camera = this.cameras.main;
		const world = camera.getWorldPoint(pointer.x, pointer.y);
		if (this.carry) this.carryTo({ x: world.x, y: world.y });
		else if (press.additive)
			this.band = { from: press.world, to: { x: world.x, y: world.y } };
		else
			camera.setScroll(
				press.scrollX - dx / camera.zoom,
				press.scrollY - dy / camera.zoom,
			);
	}

	private onRelease(pointer: Phaser.Input.Pointer): void {
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
		const now = this.time.now;
		const last = this.lastClick;
		const double =
			now - last.time < DOUBLE_CLICK_MS &&
			Math.hypot(pointer.x - last.x, pointer.y - last.y) < DOUBLE_CLICK_SLOP;
		this.lastClick = { time: double ? 0 : now, x: pointer.x, y: pointer.y };
		if (double) {
			this.walkTo(press.world);
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
		this.carry = { ids, target: null };
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
		const empty = !room && layout ? emptyTeamZoneAt(layout, point) : null;
		carry.target = room
			? { room, zone: room.zone }
			: empty
				? { room: null, zone: empty }
				: null;
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
			if (!moving.includes(id) && actor.seat)
				actor.path = findPath(payload.layout, actor.position, actor.seat);
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
					a.position.x >= left &&
					a.position.x <= right &&
					a.position.y >= top &&
					a.position.y <= bottom,
			)
			.map((a) => a.id);
		const picked = this.payload?.picked ?? [];
		this.callbacks.onPick([...new Set([...picked, ...inside])]);
	}

	/** Rings under picked teammates, the room a carried group would land in, and the Shift-drag box. */
	private drawMarks(): void {
		const marks = this.floorMarks;
		marks.clear();
		const picked = new Set(this.payload?.picked ?? []);
		for (const actor of this.actors.values()) {
			if (!picked.has(actor.id) || actor.carried) continue;
			const { x, y } = actor.position;
			marks.fillStyle(PICK_COLOR, 0.35).fillEllipse(x, y - 1, 28, 10);
			marks.lineStyle(1, PICK_COLOR, 0.9).strokeEllipse(x, y - 1, 28, 10);
		}
		const target = this.carry?.target?.zone.rect;
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

	private emitFrame(): void {
		const camera = this.cameras.main;
		const view = camera.worldView;
		const toScreen = (p: Point) => ({
			x: (p.x - view.x) * camera.zoom,
			y: (p.y - view.y) * camera.zoom,
		});
		const actors: ActorFrame[] = [];
		for (const actor of this.actors.values()) {
			const feet = toScreen(actor.position);
			const bodyShare = actor.seated ? 0.66 : 1;
			const headY = feet.y - STANDING_PX * camera.zoom * bodyShare;
			actors.push({ id: actor.id, x: feet.x, y: feet.y, headY });
		}
		const signs: SignFrame[] = [];
		const roomZones = new Set<string>();
		for (const room of this.payload?.layout.rooms ?? []) {
			roomZones.add(room.zone.id);
			const sign = room.zone.sign ?? {
				x: room.zone.rect.x + room.zone.rect.w / 2,
				y: room.zone.rect.y + room.zone.rect.h,
			};
			signs.push({ id: room.id, ...toScreen(sign) });
		}
		const labels = this.areaLabels
			.filter((label) => !roomZones.has(label.id))
			.map((label) => ({ id: label.id, ...toScreen(label.point) }));
		const target = this.carry?.target;
		const drop = target
			? {
					...toScreen({
						x: target.zone.rect.x + target.zone.rect.w / 2,
						y: target.zone.rect.y,
					}),
					label: target.room ? `Move to ${target.room.name}` : "New room here",
				}
			: null;
		this.callbacks.onFrame({ actors, signs, labels, drop, zoom: camera.zoom });
	}

	private syncActors(payload: ScenePayload): void {
		const seen = new Set<string>();
		for (const teammate of payload.state.teammates) {
			seen.add(teammate.id);
			const target = payload.layout.targets.get(teammate.id) ?? null;
			let actor = this.actors.get(teammate.id);
			if (!actor) {
				if (!target) continue;
				actor = this.spawn(teammate, target);
				this.actors.set(teammate.id, actor);
			}
			const away = teammate.presence === "away";
			actor.sprite.setAlpha(away ? 0.4 : teammate.paused ? 0.7 : 1);
			if (actor.carried) continue;
			const isMe = teammate.id === payload.meId;
			if (
				target &&
				!(isMe && actor.manual) &&
				(actor.seat?.x !== target.x || actor.seat?.y !== target.y)
			) {
				actor.seat = target;
				actor.path = findPath(payload.layout, actor.position, target);
				if (actor.path.length === 0) this.placeAt(actor, target);
			}
		}
		for (const [id, actor] of this.actors) {
			if (seen.has(id)) continue;
			actor.sprite.destroy();
			this.actors.delete(id);
		}
	}

	private spawn(teammate: Teammate, seat: SeatTarget): Actor {
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
		};
		this.placeAt(actor, seat);
		return actor;
	}

	private placeAt(actor: Actor, point: Point): void {
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
		actor.seated = !!seat;
		this.play(actor, seat ? "sit" : "idle", actor.facing);
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
		const next = actor.path[0];
		if (!next || actor.carried) return;
		const dx = next.x - actor.position.x;
		const dy = next.y - actor.position.y;
		const distance = Math.hypot(dx, dy);
		const stepSize = (WALK_SPEED * delta) / 1000;
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
			this.resumeFollow();
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

	private walkTo(point: Point): void {
		const layout = this.payload?.layout;
		const me = this.me();
		if (!layout || !me) return;
		const seat = this.seatNear(point, SEAT_CLICK);
		const target = seat ? { x: seat.x, y: seat.y } : point;
		if (!seat && !isWalkable(layout, target)) return;
		const path = findPath(layout, me.position, target);
		if (path.length === 0) return;
		me.manual = true;
		me.path = path;
		this.resumeFollow();
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
