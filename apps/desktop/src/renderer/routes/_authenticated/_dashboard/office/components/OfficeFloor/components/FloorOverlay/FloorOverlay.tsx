import { cn } from "@superset/ui/utils";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import type { Teammate } from "../../../../types";
import type { PlacedRoom } from "../../../../utils/world";
import { EngineMark } from "../../../EngineMark";
import type { SceneFrame } from "../../scene";

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
}

const PILL_GAP = 6;
const PILL_ROW = 32;
const COMPACT_PILL_ROW = 24;
/** Room signs hang just under their area so they never cover the people sitting in it. */
const SIGN_DROP = 4;
/** Below this zoom name tags shrink to a face, so the whole office stays readable. */
const COMPACT_BELOW = 1;
const DRAG_START = 5;

export const FloorOverlay = forwardRef<FloorOverlayHandle, FloorOverlayProps>(
	function FloorOverlay(
		{
			teammates,
			rooms,
			areas,
			faces,
			selectedId,
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
		},
		ref,
	) {
		const actorNodes = useRef(new Map<string, HTMLDivElement>());
		const signNodes = useRef(new Map<string, HTMLDivElement>());
		const labelNodes = useRef(new Map<string, HTMLDivElement>());
		const rootRef = useRef<HTMLDivElement>(null);
		const dropRef = useRef<HTMLDivElement>(null);
		const tagPress = useRef<{
			id: string;
			x: number;
			y: number;
			carrying: boolean;
		} | null>(null);
		const relative = (event: { clientX: number; clientY: number }) => {
			const box = rootRef.current?.getBoundingClientRect();
			return {
				x: event.clientX - (box?.left ?? 0),
				y: event.clientY - (box?.top ?? 0),
			};
		};

		useImperativeHandle(ref, () => ({
			setFrame(frame) {
				const compact = frame.zoom < COMPACT_BELOW;
				if (rootRef.current) rootRef.current.dataset.compact = String(compact);
				const row = compact ? COMPACT_PILL_ROW : PILL_ROW;
				const placed: { left: number; right: number; bottom: number }[] = [];
				const ordered = [...frame.actors].sort((a, b) => a.y - b.y);
				for (const actor of ordered) {
					const node = actorNodes.current.get(actor.id);
					if (!node) continue;
					const width = node.firstElementChild?.clientWidth ?? 0;
					const box = {
						left: actor.x - width / 2,
						right: actor.x + width / 2,
						bottom: actor.headY - PILL_GAP,
					};
					for (const other of placed) {
						const overlapsX =
							box.left < other.right + 4 && box.right > other.left - 4;
						const overlapsY = Math.abs(box.bottom - other.bottom) < row;
						if (overlapsX && overlapsY) box.bottom = other.bottom - row;
					}
					placed.push(box);
					node.style.transform = `translate(${actor.x}px, ${box.bottom}px)`;
					node.style.visibility = "visible";
				}
				for (const sign of frame.signs) {
					const node = signNodes.current.get(sign.id);
					if (!node) continue;
					node.style.transform = `translate(${sign.x}px, ${sign.y + SIGN_DROP}px)`;
					node.style.visibility = "visible";
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
						const text = drop.firstElementChild;
						if (text && text.textContent !== frame.drop.label)
							text.textContent = frame.drop.label;
					}
				}
			},
		}));

		const bindActor = useCallback(
			(id: string) => (node: HTMLDivElement | null) => {
				if (node) actorNodes.current.set(id, node);
				else actorNodes.current.delete(id);
			},
			[],
		);
		const bindSign = useCallback(
			(id: string) => (node: HTMLDivElement | null) => {
				if (node) signNodes.current.set(id, node);
				else signNodes.current.delete(id);
			},
			[],
		);
		const bindLabel = useCallback(
			(id: string) => (node: HTMLDivElement | null) => {
				if (node) labelNodes.current.set(id, node);
				else labelNodes.current.delete(id);
			},
			[],
		);

		return (
			<div
				ref={rootRef}
				className="group/floor pointer-events-none absolute inset-0 overflow-hidden"
			>
				<div
					ref={dropRef}
					className="invisible absolute left-0 top-0 z-10 will-change-transform"
				>
					<div className="-translate-x-1/2 translate-y-1.5 whitespace-nowrap rounded-full bg-[#5ec8ff] px-2.5 py-1 text-[12px] font-medium text-black shadow-md" />
				</div>
				{areas.map((area) => (
					<div
						key={area.id}
						ref={bindLabel(area.id)}
						className="invisible absolute left-0 top-0 will-change-transform"
					>
						<div className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
							{area.label}
						</div>
					</div>
				))}
				{rooms.map((room) => (
					<div
						key={room.id}
						ref={bindSign(room.id)}
						className="invisible absolute left-0 top-0 will-change-transform"
					>
						<button
							type="button"
							onClick={() => onSelectRoom(room.id)}
							title={room.name}
							className="pointer-events-auto flex max-w-[150px] -translate-x-1/2 rounded-md border border-border bg-popover/90 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground shadow-sm backdrop-blur hover:bg-fill-hover group-data-[compact=true]/floor:px-1.5 group-data-[compact=true]/floor:py-0.5 group-data-[compact=true]/floor:text-[9px]"
						>
							<span className="shrink-0 text-muted-foreground">[&nbsp;</span>
							<span className="min-w-0 truncate">{room.name}</span>
							<span className="shrink-0 text-muted-foreground">&nbsp;]</span>
						</button>
					</div>
				))}
				{teammates.map((t) => {
					const isMe = t.id === meId;
					const busy = t.presence === "focused" || t.presence === "in-meeting";
					const line = busy && t.line ? t.line : "";
					const away = t.presence === "away";
					return (
						<div
							key={t.id}
							ref={bindActor(t.id)}
							className={cn(
								"invisible absolute left-0 top-0 flex flex-col items-center will-change-transform",
								away && "opacity-50",
							)}
						>
							<div className="-translate-x-1/2 -translate-y-full flex flex-col items-center gap-1">
								{line ? (
									<div className="relative max-w-[220px] rounded-xl group-data-[compact=true]/floor:hidden border border-border bg-popover px-3 py-1.5 text-[12px] leading-snug text-foreground shadow-md">
										{line}
										<span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-b border-r border-border bg-popover" />
									</div>
								) : null}
								<button
									type="button"
									onPointerDown={(event) => {
										if (isMe || !canCarry || event.button !== 0) return;
										tagPress.current = {
											id: t.id,
											x: event.clientX,
											y: event.clientY,
											carrying: false,
										};
										event.currentTarget.setPointerCapture(event.pointerId);
									}}
									onPointerMove={(event) => {
										const press = tagPress.current;
										if (!press || press.id !== t.id) return;
										if (!press.carrying) {
											const moved = Math.hypot(
												event.clientX - press.x,
												event.clientY - press.y,
											);
											if (moved < DRAG_START) return;
											press.carrying = true;
											onCarryStart(t.id);
										}
										const at = relative(event);
										onCarryMove(at.x, at.y);
									}}
									onPointerUp={() => {
										if (tagPress.current?.carrying) onCarryEnd();
									}}
									onPointerCancel={() => {
										if (tagPress.current?.carrying) onCarryEnd();
										tagPress.current = null;
									}}
									onClick={(event) => {
										const carried = tagPress.current?.carrying;
										tagPress.current = null;
										if (carried) return;
										onClickTeammate(
											t.id,
											event.shiftKey || event.metaKey || event.ctrlKey,
										);
									}}
									className={cn(
										"pointer-events-auto flex touch-none items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[12px] font-medium shadow-md backdrop-blur transition-transform hover:scale-[1.03] group-data-[compact=true]/floor:gap-1 group-data-[compact=true]/floor:pr-1",
										!isMe && canCarry && "cursor-grab active:cursor-grabbing",
										isMe
											? "border-foreground bg-foreground text-background"
											: "border-border bg-popover/95 text-foreground",
										t.id === selectedId &&
											"ring-2 ring-ring ring-offset-1 ring-offset-background",
										picked.includes(t.id) &&
											"ring-2 ring-[#5ec8ff] ring-offset-1 ring-offset-background",
									)}
								>
									{isMe ? null : (
										<img
											src={faces.get(t.id)}
											alt=""
											className="size-5 rounded-full bg-muted object-cover"
											draggable={false}
										/>
									)}
									{icons?.get(t.id) ? (
										<img
											src={icons.get(t.id)}
											alt=""
											className="size-3 object-contain group-data-[compact=true]/floor:hidden"
											draggable={false}
										/>
									) : (
										<EngineMark
											engine={t.engine}
											className="size-3 group-data-[compact=true]/floor:hidden"
										/>
									)}
									<span
										className={cn(
											isMe
												? "pl-1.5"
												: "group-data-[compact=true]/floor:hidden",
										)}
									>
										{isMe ? "You" : t.name}
									</span>
									<span
										className="size-2 rounded-full"
										style={{
											background:
												dots?.get(t.id) ??
												(away
													? "transparent"
													: t.paused
														? "#f5b942"
														: "#39d353"),
											boxShadow: away ? "0 0 0 1px currentColor" : undefined,
										}}
									/>
								</button>
							</div>
						</div>
					);
				})}
			</div>
		);
	},
);
