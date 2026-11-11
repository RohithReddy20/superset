import { cn } from "@superset/ui/utils";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { Mood, Teammate } from "../../../../types";
import type { PlacedRoom } from "../../../../utils/world";
import type { SceneFrame } from "../../scene";
import { NameTag } from "./components/NameTag";
import { RoomSign } from "./components/RoomSign";

export interface FloorOverlayHandle {
	setFrame: (frame: SceneFrame) => void;
}

export interface AreaLabel {
	id: string;
	label: string;
}

interface FloorOverlayProps {
	teammates: Teammate[];
	rooms: PlacedRoom[];
	areas: AreaLabel[];
	faces: Map<string, string>;
	selectedId: string | null;
	selectedRoomId?: string | null;
	picked: string[];
	meId: string | null;
	/** `additive` is a Shift, Cmd or Ctrl click, which adds to or removes from the picked group. */
	onClickTeammate: (id: string, additive: boolean) => void;
	onSelectRoom: (id: string) => void;
	/** Dragging a name tag carries its teammate, in floor-relative pixels. */
	onCarryStart: (id: string) => void;
	onCarryMove: (x: number, y: number) => void;
	onCarryEnd: () => void;
	/** False turns name tags into plain buttons that cannot be dragged. */
	canCarry?: boolean;
	/** A status dot colour per teammate, in place of the office's here/paused dot. */
	dots?: ReadonlyMap<string, string>;
	/** An icon per teammate, in place of its engine mark. */
	icons?: ReadonlyMap<string, string>;
	/** What each teammate's dot means, read out with its name. */
	statusLabels?: ReadonlyMap<string, string>;
	moods?: ReadonlyMap<string, Mood>;
	/** Per teammate: items open on its own list, and messages waiting to reach it. */
	counts?: ReadonlyMap<string, { open: number; waiting: number }>;
}

interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

const TAG_GAP = 6;
/** Space kept between two tags, or a tag and a sign. */
const CLEAR = 3;
const SIGN_GAP = 4;
/** Below this zoom name tags shrink to a face, so the whole office stays readable. */
const COMPACT_BELOW = 0.85;

function overlaps(a: Box, b: Box): boolean {
	return (
		a.left < b.right + CLEAR &&
		a.right > b.left - CLEAR &&
		a.top < b.bottom + CLEAR &&
		a.bottom > b.top - CLEAR
	);
}

/** Moves a box straight up until it is clear of every placed one. */
function liftClear(box: Box, placed: Box[]): Box {
	let free = box;
	for (let pass = 0; pass < placed.length; pass++) {
		const hit = placed.find((other) => overlaps(free, other));
		if (!hit) break;
		const bottom = hit.top - CLEAR;
		free = { ...free, bottom, top: bottom - (free.bottom - free.top) };
	}
	return free;
}

export const FloorOverlay = forwardRef<FloorOverlayHandle, FloorOverlayProps>(
	function FloorOverlay(
		{
			teammates,
			rooms,
			areas,
			faces,
			selectedId,
			selectedRoomId,
			picked,
			meId,
			onClickTeammate,
			onSelectRoom,
			onCarryStart,
			onCarryMove,
			onCarryEnd,
			canCarry = true,
			dots,
			icons,
			statusLabels,
			moods,
			counts,
		},
		ref,
	) {
		const actorNodes = useRef(new Map<string, HTMLDivElement>());
		const signNodes = useRef(new Map<string, HTMLDivElement>());
		const labelNodes = useRef(new Map<string, HTMLDivElement>());
		const rootRef = useRef<HTMLDivElement>(null);
		const dropRef = useRef<HTMLDivElement>(null);

		useImperativeHandle(ref, () => ({
			setFrame(frame) {
				if (rootRef.current)
					rootRef.current.dataset.compact = String(frame.zoom < COMPACT_BELOW);
				const carried = new Set(frame.carried);
				const placed: Box[] = [];
				const lowestFirst = [...frame.actors].sort((a, b) => b.y - a.y);
				for (const actor of lowestFirst) {
					const node = actorNodes.current.get(actor.id);
					const unit = node?.firstElementChild;
					if (!node || !(unit instanceof HTMLElement)) continue;
					const bottom = actor.headY - TAG_GAP;
					const wanted: Box = {
						left: actor.x - unit.offsetWidth / 2,
						right: actor.x + unit.offsetWidth / 2,
						top: bottom - unit.offsetHeight,
						bottom,
					};
					const held = carried.has(actor.id);
					const box = held ? wanted : liftClear(wanted, placed);
					if (!held) placed.push(box);
					node.style.transform = `translate(${actor.x}px, ${bottom}px)`;
					node.style.zIndex = held ? "30" : "";
					node.style.visibility = "visible";
					unit.style.transform = `translate(-50%, calc(-100% - ${Math.round(bottom - box.bottom)}px))`;
				}
				for (const sign of frame.signs) {
					const node = signNodes.current.get(sign.id);
					const unit = node?.firstElementChild;
					if (!node || !(unit instanceof HTMLElement)) continue;
					node.style.visibility = "visible";
					if (!sign.above) {
						node.style.transform = `translate(${sign.x}px, ${sign.y + SIGN_GAP}px)`;
						unit.style.transform = "translate(-50%, 0)";
						continue;
					}
					const bottom = sign.y - SIGN_GAP;
					const box = liftClear(
						{
							left: sign.x - unit.offsetWidth / 2,
							right: sign.x + unit.offsetWidth / 2,
							top: bottom - unit.offsetHeight,
							bottom,
						},
						placed,
					);
					node.style.transform = `translate(${sign.x}px, ${bottom}px)`;
					unit.style.transform = `translate(-50%, calc(-100% - ${Math.round(bottom - box.bottom)}px))`;
				}
				const shown = new Set<string>();
				for (const label of frame.labels) {
					const node = labelNodes.current.get(label.id);
					if (!node) continue;
					shown.add(label.id);
					node.style.transform = `translate(${label.x}px, ${label.y}px)`;
					node.style.visibility = "visible";
				}
				for (const [id, node] of labelNodes.current)
					if (!shown.has(id)) node.style.visibility = "hidden";
				const drop = dropRef.current;
				if (drop) {
					drop.style.visibility = frame.drop ? "visible" : "hidden";
					if (frame.drop) {
						drop.style.transform = `translate(${frame.drop.x}px, ${frame.drop.y}px)`;
						drop.dataset.accept = String(frame.drop.accept);
						const text = drop.firstElementChild;
						if (text && text.textContent !== frame.drop.label)
							text.textContent = frame.drop.label;
					}
				}
			},
		}));

		const bind = useCallback(
			(nodes: { current: Map<string, HTMLDivElement> }, id: string) =>
				(node: HTMLDivElement | null) => {
					if (node) nodes.current.set(id, node);
					else nodes.current.delete(id);
				},
			[],
		);
		const several = picked.length > 1;

		return (
			<div
				ref={rootRef}
				className="group/floor pointer-events-none absolute inset-0 overflow-hidden"
			>
				<div
					ref={dropRef}
					className="group/drop invisible absolute left-0 top-0 z-40 will-change-transform"
				>
					<div className="-translate-x-1/2 translate-y-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-medium shadow-md group-data-[accept=false]/drop:border-border group-data-[accept=false]/drop:bg-popover group-data-[accept=false]/drop:text-muted-foreground group-data-[accept=true]/drop:border-transparent group-data-[accept=true]/drop:bg-[#5ec8ff] group-data-[accept=true]/drop:text-black" />
				</div>
				{areas.map((area) => (
					<div
						key={area.id}
						ref={bind(labelNodes, area.id)}
						className="invisible absolute left-0 top-0 will-change-transform"
					>
						<div className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-background/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
							{area.label}
						</div>
					</div>
				))}
				{rooms.map((room) => (
					<div
						key={room.id}
						ref={bind(signNodes, room.id)}
						className="invisible absolute left-0 top-0 will-change-transform"
					>
						<div className="w-max motion-safe:transition-transform motion-safe:duration-150">
							<RoomSign
								name={room.name}
								people={teammates.filter((t) => t.roomId === room.id).length}
								selected={room.id === selectedRoomId}
								onSelect={() => onSelectRoom(room.id)}
							/>
						</div>
					</div>
				))}
				{teammates.map((t) => (
					<div
						key={t.id}
						ref={bind(actorNodes, t.id)}
						className={cn(
							"invisible absolute left-0 top-0 will-change-transform hover:z-20",
							t.id === selectedId && "z-10",
						)}
					>
						<div className="w-max motion-safe:transition-transform motion-safe:duration-150">
							<NameTag
								teammate={t}
								isMe={t.id === meId}
								face={faces.get(t.id)}
								icon={icons?.get(t.id)}
								dot={dots?.get(t.id)}
								statusLabel={statusLabels?.get(t.id)}
								mood={moods?.get(t.id)}
								count={counts?.get(t.id)}
								marked={
									t.id === selectedId || (several && picked.includes(t.id))
								}
								canCarry={canCarry}
								onClick={(additive) => onClickTeammate(t.id, additive)}
								onCarryStart={() => onCarryStart(t.id)}
								onCarryMove={(clientX, clientY) => {
									const box = rootRef.current?.getBoundingClientRect();
									onCarryMove(
										clientX - (box?.left ?? 0),
										clientY - (box?.top ?? 0),
									);
								}}
								onCarryEnd={onCarryEnd}
							/>
						</div>
					</div>
				))}
			</div>
		);
	},
);
