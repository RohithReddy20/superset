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
	type Facing,
	findPath,
	isWalkable,
	type Point,
	roomAt,
	type Seat,
	type SeatTarget,
	type WorldLayout,
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
}

export interface ActorFrame {
	id: string;
	x: number;
	y: number;
	headY: number;
}

export interface SignFrame {
	roomId: string;
	x: number;
	y: number;
}

export interface SceneFrame {
	actors: ActorFrame[];
	signs: SignFrame[];
	zoom: number;
}

export interface SceneCallbacks {
	onSelectTeammate: (id: string) => void;
	onSelectRoom: (id: string) => void;
	onFrame: (frame: SceneFrame) => void;
	onReady: (scene: OfficeScene) => void;
}

interface Actor {
	id: string;
	character: string;
	sprite: Phaser.GameObjects.Sprite;
	position: Point;
	path: Point[];
	facing: Facing;
	seat: SeatTarget | null;
	manual: boolean;
	seated: boolean;
}

const WALK_SPEED = 90;
const STEP = 16;
const DIRECTIONS: Facing[] = ["down", "left", "right", "up"];
/** Seated sprites draw just after their chair, which sits a few pixels below their feet line. */
const SEATED_DEPTH_LIFT = 8;
/** Arriving this close to any seat sits you down on it; clicking this close to one walks you to it. */
const SEAT_SNAP = 12;
const SEAT_CLICK = 24;

export class OfficeScene extends Phaser.Scene {
	private readonly actors = new Map<string, Actor>();
	private readonly worldSize = {
		w: WORLD.cols * WORLD.tileSize,
		h: WORLD.rows * WORLD.tileSize,
	};
	private payload: ScenePayload | null = null;
	private keys: Record<Facing, Phaser.Input.Keyboard.Key[]> | null = null;

	constructor(private readonly callbacks: SceneCallbacks) {
		super("office");
	}

	create(): void {
		this.buildFloor();
		this.placeProps();

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
			(
				pointer: Phaser.Input.Pointer,
				over: Phaser.GameObjects.GameObject[],
			) => {
				if (over.length > 0) return;
				this.onFloorClick(pointer);
			},
		);
		this.scale.on("resize", () => this.fitCamera());
		this.fitCamera();
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
	}

	update(_time: number, delta: number): void {
		this.readKeys();
		for (const actor of this.actors.values()) this.step(actor, delta);
		this.emitFrame();
	}

	private fitCamera(): void {
		const view = this.scale.gameSize;
		const { w, h } = this.worldSize;
		const zoom = Math.min(view.width / w, view.height / h);
		const camera = this.cameras.main;
		camera.setZoom(zoom);
		camera.centerOn(w / 2, h / 2);
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
		for (const room of this.payload?.layout.rooms ?? []) {
			const sign = room.zone.sign ?? {
				x: room.zone.rect.x + room.zone.rect.w / 2,
				y: room.zone.rect.y + room.zone.rect.h,
			};
			signs.push({ roomId: room.id, ...toScreen(sign) });
		}
		this.callbacks.onFrame({ actors, signs, zoom: camera.zoom });
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
		const sprite = this.add
			.sprite(0, 0, character, 0)
			.setOrigin(cell.feetX / cell.w, cell.feetY / cell.h)
			.setInteractive({ useHandCursor: true });
		sprite.on("pointerdown", () =>
			this.callbacks.onSelectTeammate(teammate.id),
		);
		const actor: Actor = {
			id: teammate.id,
			character,
			sprite,
			position: { x: seat.x, y: seat.y },
			path: [],
			facing: seat.facing,
			seat,
			manual: false,
			seated: false,
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
		if (!next) return;
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

	private onFloorClick(pointer: Phaser.Input.Pointer): void {
		const layout = this.payload?.layout;
		if (!layout) return;
		const point = { x: pointer.worldX, y: pointer.worldY };
		const room = roomAt(layout, point);
		if (room) this.callbacks.onSelectRoom(room.id);
		const me = this.payload?.meId ? this.actors.get(this.payload.meId) : null;
		if (!me) return;
		const seat = this.seatNear(point, SEAT_CLICK);
		const target = seat ? { x: seat.x, y: seat.y } : point;
		if (!seat && !isWalkable(layout, target)) return;
		const path = findPath(layout, me.position, target);
		if (path.length === 0) return;
		me.manual = true;
		me.path = path;
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
