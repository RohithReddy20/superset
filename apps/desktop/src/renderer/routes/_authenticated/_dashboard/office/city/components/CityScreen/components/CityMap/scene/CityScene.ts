import Phaser from "phaser";
import { toCanvas } from "../../../../../../components/OfficeFloor/scene/pixel";
import type { AgentStatus } from "../../../../../types";
import { buildingAt, type CityLayout } from "../../../../../utils/cityLayout";
import { drawBuilding, drawGround } from "./art";

export interface CitySignFrame {
	id: string;
	x: number;
	y: number;
}

export interface CityFrame {
	signs: CitySignFrame[];
	zoom: number;
	hovered: string | null;
}

export interface CityView {
	canZoomIn: boolean;
	canZoomOut: boolean;
}

export interface CityCallbacks {
	onEnter: (id: string) => void;
	onFrame: (frame: CityFrame) => void;
	onView: (view: CityView) => void;
	onReady: (scene: CityScene) => void;
}

interface Press {
	x: number;
	y: number;
	scrollX: number;
	scrollY: number;
	moved: boolean;
}

const LIGHT: Record<AgentStatus, number> = {
	idle: 0x9fc0ff,
	working: 0xffd36b,
	permission: 0xff8a50,
	review: 0x7ef0a2,
	failed: 0xff5a5a,
};
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];
const DRAG_START = 5;
const WHEEL_STEP = 80;
const HOVER_COLOR = 0xffffff;

export class CityScene extends Phaser.Scene {
	private layout: CityLayout | null = null;
	private walls = new Map<string, string>();
	private ground: Phaser.GameObjects.Image | null = null;
	private groundKey: string | null = null;
	private readonly bodies = new Map<
		string,
		{ image: Phaser.GameObjects.Image; key: string }
	>();
	private windowLights!: Phaser.GameObjects.Graphics;
	private outline!: Phaser.GameObjects.Graphics;
	private hovered: string | null = null;
	private press: Press | null = null;
	private zoom: number | null = null;
	private wheel = 0;

	constructor(private readonly callbacks: CityCallbacks) {
		super("city");
	}

	create(): void {
		this.windowLights = this.add.graphics().setDepth(2);
		this.outline = this.add.graphics().setDepth(3);
		this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
			const camera = this.cameras.main;
			this.press = {
				x: pointer.x,
				y: pointer.y,
				scrollX: camera.scrollX,
				scrollY: camera.scrollY,
				moved: false,
			};
		});
		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) =>
			this.onMove(pointer),
		);
		this.input.on("pointerup", (pointer: Phaser.Input.Pointer) =>
			this.onRelease(pointer),
		);
		this.input.on("pointerupoutside", () => {
			this.press = null;
		});
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
		this.scale.on("resize", () => this.frameCamera(false));
		this.game.events.on(Phaser.Core.Events.POST_RENDER, this.emitFrame, this);
		this.events.once(Phaser.Scenes.Events.DESTROY, () =>
			this.game.events.off(
				Phaser.Core.Events.POST_RENDER,
				this.emitFrame,
				this,
			),
		);
		this.callbacks.onReady(this);
	}

	setCity(layout: CityLayout, walls: Map<string, string>): void {
		const first = !this.layout;
		const resized =
			!this.layout ||
			this.layout.w !== layout.w ||
			this.layout.h !== layout.h ||
			this.layout.buildings.length !== layout.buildings.length;
		this.layout = layout;
		this.walls = walls;
		if (resized) this.buildGround(layout);
		this.syncBuildings(layout);
		if (first || resized) this.frameCamera(true);
	}

	update(time: number): void {
		this.drawLights(time);
	}

	zoomIn(): void {
		const zoom = this.cameras.main.zoom;
		this.zoom = ZOOMS.find((z) => z > zoom + 0.01) ?? zoom;
		this.frameCamera(false);
	}

	zoomOut(): void {
		const zoom = this.cameras.main.zoom;
		this.zoom = ZOOMS.filter((z) => z < zoom - 0.01).at(-1) ?? zoom;
		this.frameCamera(false);
	}

	showWholeCity(): void {
		this.zoom = null;
		this.frameCamera(true);
	}

	private buildGround(layout: CityLayout): void {
		const key = `city-ground-${layout.w}x${layout.h}-${layout.buildings.length}`;
		if (!this.textures.exists(key))
			this.textures.addCanvas(key, toCanvas(drawGround(layout)));
		this.ground?.destroy();
		if (this.groundKey && this.groundKey !== key)
			this.textures.remove(this.groundKey);
		this.groundKey = key;
		this.ground = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
	}

	private syncBuildings(layout: CityLayout): void {
		const seen = new Set<string>();
		for (const building of layout.buildings) {
			seen.add(building.id);
			const wall = this.walls.get(building.id) ?? "#6b7a8f";
			const key = `city-building-${building.id}-${building.floors}-${wall}-${building.body.x}-${building.body.y}`;
			const existing = this.bodies.get(building.id);
			if (existing?.key === key) continue;
			if (!this.textures.exists(key))
				this.textures.addCanvas(key, toCanvas(drawBuilding(building, wall)));
			existing?.image.destroy();
			if (existing) this.textures.remove(existing.key);
			const image = this.add
				.image(building.body.x, building.body.y, key)
				.setOrigin(0, 0)
				.setDepth(1);
			this.bodies.set(building.id, { image, key });
		}
		for (const [id, body] of this.bodies) {
			if (seen.has(id)) continue;
			body.image.destroy();
			this.textures.remove(body.key);
			this.bodies.delete(id);
		}
	}

	/** Lit windows: one per agent, coloured by what it is doing; a request for you blinks. */
	private drawLights(time: number): void {
		const lights = this.windowLights;
		lights.clear();
		const blink = 0.55 + 0.45 * Math.sin(time / 180);
		for (const building of this.layout?.buildings ?? [])
			for (const w of building.windows) {
				if (!w.status) continue;
				const color = LIGHT[w.status];
				const alpha =
					w.status === "permission" ? blink : w.status === "idle" ? 0.45 : 1;
				if (w.status !== "idle")
					lights
						.fillStyle(color, 0.22 * alpha)
						.fillRect(w.x - 3, w.y - 3, w.w + 6, w.h + 6);
				lights.fillStyle(color, alpha).fillRect(w.x, w.y, w.w, w.h);
				lights
					.fillStyle(0xffffff, 0.35 * alpha)
					.fillRect(w.x + 1, w.y + 1, 3, 2);
			}
		this.outline.clear();
		const hovered = this.layout?.buildings.find((b) => b.id === this.hovered);
		if (hovered)
			this.outline
				.lineStyle(2 / this.cameras.main.zoom, HOVER_COLOR, 0.9)
				.strokeRect(
					hovered.body.x - 1,
					hovered.body.y - 1,
					hovered.body.w + 2,
					hovered.body.h + 2,
				);
	}

	private onMove(pointer: Phaser.Input.Pointer): void {
		const press = this.press;
		const camera = this.cameras.main;
		if (press && pointer.isDown) {
			const dx = pointer.x - press.x;
			const dy = pointer.y - press.y;
			if (!press.moved && Math.hypot(dx, dy) < DRAG_START) return;
			press.moved = true;
			this.setHovered(null);
			this.input.setDefaultCursor("grabbing");
			camera.setScroll(
				press.scrollX - dx / camera.zoom,
				press.scrollY - dy / camera.zoom,
			);
			return;
		}
		const world = camera.getWorldPoint(pointer.x, pointer.y);
		const layout = this.layout;
		this.setHovered(layout ? (buildingAt(layout, world)?.id ?? null) : null);
	}

	private onRelease(pointer: Phaser.Input.Pointer): void {
		const press = this.press;
		this.press = null;
		this.input.setDefaultCursor(this.hovered ? "pointer" : "");
		if (!press || press.moved || !this.layout) return;
		const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
		const building = buildingAt(this.layout, world);
		if (building) this.callbacks.onEnter(building.id);
	}

	private setHovered(id: string | null): void {
		if (this.hovered === id) return;
		this.hovered = id;
		this.input.setDefaultCursor(id ? "pointer" : "");
	}

	/** Fits the whole city, or keeps the chosen zoom around the current centre. */
	private frameCamera(recenter: boolean): void {
		const layout = this.layout;
		if (!layout) return;
		const camera = this.cameras.main;
		const view = this.scale.gameSize;
		const center = recenter
			? { x: layout.w / 2, y: layout.h / 2 }
			: { x: camera.worldView.centerX, y: camera.worldView.centerY };
		const fit = Math.min(view.width / layout.w, view.height / layout.h);
		const fitted =
			ZOOMS.filter((z) => z <= fit * 0.98).at(-1) ?? (ZOOMS[0] as number);
		const zoom = Math.min(this.zoom ?? fitted, 2.5);
		camera.setZoom(zoom);
		const seenW = view.width / zoom;
		const seenH = view.height / zoom;
		camera.setBounds(
			Math.min(0, (layout.w - seenW) / 2),
			Math.min(0, (layout.h - seenH) / 2),
			Math.max(layout.w, seenW),
			Math.max(layout.h, seenH),
		);
		camera.centerOn(center.x, center.y);
		this.callbacks.onView({
			canZoomIn: zoom < (ZOOMS.at(-1) as number),
			canZoomOut: zoom > (ZOOMS[0] as number),
		});
	}

	private emitFrame(): void {
		const camera = this.cameras.main;
		const view = camera.worldView;
		const signs = (this.layout?.buildings ?? []).map((b) => ({
			id: b.id,
			x: (b.roof.x - view.x) * camera.zoom,
			y: (b.roof.y - view.y) * camera.zoom,
		}));
		this.callbacks.onFrame({
			signs,
			zoom: camera.zoom,
			hovered: this.hovered,
		});
	}
}

export function createCityGame(
	parent: HTMLElement,
	callbacks: CityCallbacks,
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
		scene: new CityScene(callbacks),
	});
}
