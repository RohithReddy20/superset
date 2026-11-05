import Phaser from "phaser";
import type { OfficeSnapshot, Teammate } from "../../../types";
import {
	type Facing,
	findPath,
	HUDDLE_ROOM_ID,
	type OfficeLayout,
	roomAt,
	type SeatSpot,
	TILE,
	type TilePoint,
} from "../../../utils/layout";
import { ENGINE_COLORS, engineLabel } from "../constants";
import { PROP_ATLASES, TILESET_URLS } from "./assets";

export interface ScenePayload {
	state: OfficeSnapshot;
	layout: OfficeLayout;
	selectedId: string | null;
	meId: string | null;
}

export interface SceneCallbacks {
	onSelectTeammate: (id: string) => void;
	onSelectRoom: (id: string) => void;
	onReady: (scene: OfficeScene) => void;
}

interface Actor {
	id: string;
	sprite: Phaser.GameObjects.Sprite;
	pill: Phaser.GameObjects.Container;
	pillBox: Phaser.GameObjects.Graphics;
	pillText: Phaser.GameObjects.Text;
	bubble: Phaser.GameObjects.Text;
	tile: TilePoint;
	path: TilePoint[];
	facing: Facing;
	seat: SeatSpot | null;
	manual: boolean;
	label: string;
	color: string;
	selected: boolean;
}

const WALK_SPEED = 96;
const SEAT_LIFT = 10;
const EXTRUDE = 1;
const FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";
const DIRECTIONS: Facing[] = ["down", "left", "right", "up"];

export class OfficeScene extends Phaser.Scene {
	private readonly actors = new Map<string, Actor>();
	private mapObjects: Phaser.GameObjects.GameObject[] = [];
	private tilemaps: Phaser.Tilemaps.Tilemap[] = [];
	private layoutKey = "";
	private payload: ScenePayload | null = null;
	private keys: Record<Facing, Phaser.Input.Keyboard.Key[]> | null = null;

	constructor(private readonly callbacks: SceneCallbacks) {
		super("office");
	}

	preload(): void {
		this.load.spritesheet("floors", TILESET_URLS.floors, {
			frameWidth: TILE,
			frameHeight: TILE,
		});
		this.load.spritesheet("walls", TILESET_URLS.walls, {
			frameWidth: TILE,
			frameHeight: TILE,
		});
		this.load.spritesheet("worker", TILESET_URLS.worker, {
			frameWidth: TILE,
			frameHeight: TILE,
		});
		for (const [name, atlas] of Object.entries(PROP_ATLASES))
			this.load.image(`props_${name}`, atlas.url);
	}

	create(): void {
		for (const [name, atlas] of Object.entries(PROP_ATLASES)) {
			const texture = this.textures.get(`props_${name}`);
			for (const [frame, f] of Object.entries(atlas.frames))
				texture.add(frame, 0, f.x, f.y, f.w, f.h);
		}
		DIRECTIONS.forEach((facing, row) => {
			this.anims.create({
				key: `idle-${facing}`,
				frames: this.anims.generateFrameNumbers("worker", {
					start: row * 4,
					end: row * 4 + 3,
				}),
				frameRate: 4,
				repeat: -1,
			});
			this.anims.create({
				key: `walk-${facing}`,
				frames: this.anims.generateFrameNumbers("worker", {
					start: 16 + row * 4,
					end: 16 + row * 4 + 3,
				}),
				frameRate: 8,
				repeat: -1,
			});
		});

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
		this.callbacks.onReady(this);
	}

	setState(payload: ScenePayload): void {
		this.payload = payload;
		const key = JSON.stringify({
			w: payload.layout.w,
			h: payload.layout.h,
			rooms: payload.layout.rooms,
			props: payload.layout.props,
		});
		if (key !== this.layoutKey) {
			this.layoutKey = key;
			this.buildMap(payload.layout);
			this.fitCamera();
		}
		this.syncActors(payload);
	}

	update(_time: number, delta: number): void {
		this.readKeys();
		for (const actor of this.actors.values()) this.step(actor, delta);
	}

	private buildMap(layout: OfficeLayout): void {
		for (const object of this.mapObjects) object.destroy();
		this.mapObjects = [];
		for (const map of this.tilemaps) map.destroy();
		this.tilemaps = [];

		const rows = (data: Int8Array) =>
			Array.from({ length: layout.h }, (_, y) =>
				Array.from({ length: layout.w }, (_, x) => data[y * layout.w + x]),
			);
		for (const [key, data, depth] of [
			["floors", layout.floor, 0],
			["walls", layout.walls, 1],
		] as const) {
			const map = this.make.tilemap({
				data: rows(data),
				tileWidth: TILE,
				tileHeight: TILE,
			});
			const tiles = map.addTilesetImage(
				key,
				this.extruded(key),
				TILE,
				TILE,
				EXTRUDE,
				EXTRUDE * 2,
			);
			if (tiles) map.createLayer(0, tiles, 0, 0)?.setDepth(depth);
			this.tilemaps.push(map);
		}

		for (const room of layout.rooms) {
			const text = this.add
				.text(
					(room.outer.x + 1) * TILE + 4,
					(room.outer.y + 1) * TILE + 6,
					room.name.toUpperCase(),
					{
						fontFamily: FONT,
						fontSize: "9px",
						color: "#4a4650",
						letterSpacing: 1,
					},
				)
				.setResolution(3)
				.setDepth(5000);
			this.mapObjects.push(text);
		}

		layout.props.forEach((prop, index) => {
			const frame = PROP_ATLASES[prop.atlas]?.frames[prop.frame];
			if (!frame) return;
			const image = this.add
				.image(
					prop.tile.x * TILE - frame.ax,
					prop.tile.y * TILE - frame.ay,
					`props_${prop.atlas}`,
					prop.frame,
				)
				.setOrigin(0, 0)
				.setDepth((prop.tile.y + frame.fh) * TILE + index * 0.001);
			this.mapObjects.push(image);
		});

		for (const actor of this.actors.values()) {
			if (layout.blocked[actor.tile.y * layout.w + actor.tile.x]) {
				actor.path = [];
				actor.manual = false;
				if (actor.seat) this.placeAt(actor, actor.seat.tile);
			}
		}
	}

	/**
	 * Copies a tileset into a canvas with each tile's edge pixels repeated
	 * around it, so fractional zoom never samples the neighbouring tile.
	 */
	private extruded(key: string): string {
		const outKey = `${key}-extruded`;
		if (this.textures.exists(outKey)) return outKey;
		const source = this.textures.get(key).getSourceImage() as HTMLImageElement;
		const cols = Math.floor(source.width / TILE);
		const rows = Math.floor(source.height / TILE);
		const cell = TILE + EXTRUDE * 2;
		const canvas = document.createElement("canvas");
		canvas.width = cols * cell;
		canvas.height = rows * cell;
		const ctx = canvas.getContext("2d");
		if (!ctx) return key;
		ctx.imageSmoothingEnabled = false;
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				const sx = col * TILE;
				const sy = row * TILE;
				const dx = col * cell + EXTRUDE;
				const dy = row * cell + EXTRUDE;
				ctx.drawImage(source, sx, sy, TILE, TILE, dx, dy, TILE, TILE);
				ctx.drawImage(source, sx, sy, TILE, 1, dx, dy - EXTRUDE, TILE, EXTRUDE);
				ctx.drawImage(
					source,
					sx,
					sy + TILE - 1,
					TILE,
					1,
					dx,
					dy + TILE,
					TILE,
					EXTRUDE,
				);
				ctx.drawImage(source, sx, sy, 1, TILE, dx - EXTRUDE, dy, EXTRUDE, TILE);
				ctx.drawImage(
					source,
					sx + TILE - 1,
					sy,
					1,
					TILE,
					dx + TILE,
					dy,
					EXTRUDE,
					TILE,
				);
				ctx.drawImage(
					source,
					sx,
					sy,
					1,
					1,
					dx - EXTRUDE,
					dy - EXTRUDE,
					EXTRUDE,
					EXTRUDE,
				);
				ctx.drawImage(
					source,
					sx + TILE - 1,
					sy,
					1,
					1,
					dx + TILE,
					dy - EXTRUDE,
					EXTRUDE,
					EXTRUDE,
				);
				ctx.drawImage(
					source,
					sx,
					sy + TILE - 1,
					1,
					1,
					dx - EXTRUDE,
					dy + TILE,
					EXTRUDE,
					EXTRUDE,
				);
				ctx.drawImage(
					source,
					sx + TILE - 1,
					sy + TILE - 1,
					1,
					1,
					dx + TILE,
					dy + TILE,
					EXTRUDE,
					EXTRUDE,
				);
			}
		}
		this.textures.addCanvas(outKey, canvas);
		return outKey;
	}

	private fitCamera(): void {
		if (!this.payload) return;
		const { w, h } = this.payload.layout;
		const view = this.scale.gameSize;
		const fit = Math.min(view.width / (w * TILE), view.height / (h * TILE));
		const zoom = Phaser.Math.Clamp(fit, 0.5, 3);
		const camera = this.cameras.main;
		camera.setZoom(zoom);
		camera.centerOn((w * TILE) / 2, (h * TILE) / 2);
		camera.setScroll(Math.round(camera.scrollX), Math.round(camera.scrollY));
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
			this.dress(actor, teammate, teammate.id === payload.selectedId);
			const isMe = teammate.id === payload.meId;
			if (
				target &&
				!(isMe && actor.manual) &&
				(actor.seat?.tile.x !== target.tile.x ||
					actor.seat?.tile.y !== target.tile.y)
			) {
				actor.seat = target;
				actor.path = findPath(payload.layout, actor.tile, target.tile);
				if (actor.path.length === 0) this.placeAt(actor, target.tile);
			}
		}
		for (const [id, actor] of this.actors) {
			if (seen.has(id)) continue;
			actor.sprite.destroy();
			actor.pill.destroy();
			actor.bubble.destroy();
			this.actors.delete(id);
		}
	}

	private spawn(teammate: Teammate, seat: SeatSpot): Actor {
		const sprite = this.add
			.sprite(0, 0, "worker", 0)
			.setOrigin(0.5, 30 / 32)
			.setInteractive({ useHandCursor: true });
		sprite.on("pointerdown", () =>
			this.callbacks.onSelectTeammate(teammate.id),
		);
		const pillBox = this.add.graphics();
		const pillText = this.add
			.text(0, 0, "", { fontFamily: FONT, fontSize: "9px", color: "#f3f1ea" })
			.setResolution(3)
			.setOrigin(0, 0.5);
		const pill = this.add.container(0, 0, [pillBox, pillText]).setDepth(10_000);
		const bubble = this.add
			.text(0, 0, "", {
				fontFamily: FONT,
				fontSize: "8px",
				color: "#c9c6bd",
				backgroundColor: "#15151a",
				padding: { x: 4, y: 2 },
			})
			.setResolution(3)
			.setOrigin(0.5, 1)
			.setDepth(10_001)
			.setVisible(false);
		const actor: Actor = {
			id: teammate.id,
			sprite,
			pill,
			pillBox,
			pillText,
			bubble,
			tile: { ...seat.tile },
			path: [],
			facing: seat.facing,
			seat,
			manual: false,
			label: "",
			color: "",
			selected: false,
		};
		this.placeAt(actor, seat.tile);
		return actor;
	}

	private dress(actor: Actor, teammate: Teammate, selected: boolean): void {
		const color = ENGINE_COLORS[teammate.engine ?? "human"];
		const label =
			teammate.kind === "ai"
				? `${teammate.name} · ${engineLabel(teammate.engine)}`
				: teammate.name;
		if (
			label !== actor.label ||
			color !== actor.color ||
			selected !== actor.selected
		) {
			actor.label = label;
			actor.color = color;
			actor.selected = selected;
			actor.pillText.setText(label);
			actor.pillText.setColor(selected ? "#15151a" : "#f3f1ea");
			const width = actor.pillText.width + 18;
			actor.pillText.setPosition(-width / 2 + 13, 0);
			actor.pillBox.clear();
			actor.pillBox.fillStyle(selected ? 0xf3f1ea : 0x15151a, 0.92);
			actor.pillBox.fillRoundedRect(-width / 2, -7, width, 14, 7);
			actor.pillBox.lineStyle(
				1,
				Phaser.Display.Color.HexStringToColor(color).color,
				1,
			);
			actor.pillBox.strokeRoundedRect(-width / 2, -7, width, 14, 7);
			actor.pillBox.fillStyle(
				Phaser.Display.Color.HexStringToColor(color).color,
				1,
			);
			actor.pillBox.fillCircle(-width / 2 + 7, 0, 2.5);
		}
		const away = teammate.presence === "away";
		actor.sprite.setAlpha(away ? 0.35 : teammate.paused ? 0.6 : 1);
		actor.pill.setAlpha(away ? 0.5 : 1);
		const busy =
			teammate.presence === "focused" || teammate.presence === "in-meeting";
		const line = busy && teammate.line ? teammate.line.slice(0, 36) : "";
		actor.bubble.setText(line);
		actor.bubble.setVisible(line.length > 0);
	}

	private placeAt(actor: Actor, tile: TilePoint): void {
		actor.tile = { ...tile };
		actor.sprite.setPosition(
			tile.x * TILE + TILE / 2,
			tile.y * TILE + TILE - 2,
		);
		this.settle(actor);
	}

	private settle(actor: Actor): void {
		const seated =
			!!actor.seat &&
			!actor.manual &&
			actor.seat.tile.x === actor.tile.x &&
			actor.seat.tile.y === actor.tile.y;
		const facing = seated && actor.seat ? actor.seat.facing : actor.facing;
		actor.facing = facing;
		if (seated) actor.sprite.y = actor.tile.y * TILE + TILE - SEAT_LIFT;
		actor.sprite.anims.play(`idle-${facing}`, true);
		this.layer(actor);
	}

	private layer(actor: Actor): void {
		const feet = Math.max(actor.sprite.y, (actor.tile.y + 1) * TILE - 2);
		actor.sprite.setDepth(feet + 4);
		actor.pill.setPosition(actor.sprite.x, actor.sprite.y - 44);
		actor.bubble.setPosition(actor.sprite.x, actor.sprite.y - 54);
	}

	private step(actor: Actor, delta: number): void {
		const next = actor.path[0];
		if (!next) return;
		const tx = next.x * TILE + TILE / 2;
		const ty = next.y * TILE + TILE - 2;
		const dx = tx - actor.sprite.x;
		const dy = ty - actor.sprite.y;
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
		actor.sprite.anims.play(`walk-${facing}`, true);
		if (distance <= stepSize) {
			actor.sprite.setPosition(tx, ty);
			actor.tile = { ...next };
			actor.path.shift();
			if (actor.path.length === 0) this.settle(actor);
		} else {
			actor.sprite.x += (dx / distance) * stepSize;
			actor.sprite.y += (dy / distance) * stepSize;
		}
		this.layer(actor);
	}

	private readKeys(): void {
		if (!this.keys || !this.payload?.meId) return;
		const me = this.actors.get(this.payload.meId);
		if (!me || me.path.length > 0) return;
		for (const facing of DIRECTIONS) {
			if (!this.keys[facing].some((key) => key.isDown)) continue;
			const next = {
				x: me.tile.x + (facing === "right" ? 1 : facing === "left" ? -1 : 0),
				y: me.tile.y + (facing === "down" ? 1 : facing === "up" ? -1 : 0),
			};
			me.manual = true;
			me.facing = facing;
			if (this.walkable(next)) me.path = [next];
			else me.sprite.anims.play(`idle-${facing}`, true);
			return;
		}
	}

	private walkable(tile: TilePoint): boolean {
		const layout = this.payload?.layout;
		if (!layout) return false;
		if (tile.x < 0 || tile.y < 0 || tile.x >= layout.w || tile.y >= layout.h)
			return false;
		return layout.blocked[tile.y * layout.w + tile.x] === 0;
	}

	private onFloorClick(pointer: Phaser.Input.Pointer): void {
		const layout = this.payload?.layout;
		if (!layout) return;
		const tile = {
			x: Math.floor(pointer.worldX / TILE),
			y: Math.floor(pointer.worldY / TILE),
		};
		const room = roomAt(layout, tile);
		if (room && room.id !== HUDDLE_ROOM_ID)
			this.callbacks.onSelectRoom(room.id);
		const me = this.payload?.meId ? this.actors.get(this.payload.meId) : null;
		if (!me || !this.walkable(tile)) return;
		const path = findPath(layout, me.tile, tile);
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
		scale: {
			mode: Phaser.Scale.RESIZE,
			width: "100%",
			height: "100%",
		},
		input: { keyboard: { target: parent } },
		scene: new OfficeScene(callbacks),
	});
}
