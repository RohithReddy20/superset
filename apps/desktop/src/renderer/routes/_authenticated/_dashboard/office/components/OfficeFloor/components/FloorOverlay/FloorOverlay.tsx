import { cn } from "@superset/ui/utils";
import {
	forwardRef,
	useCallback,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import type { Teammate } from "../../../../types";
import type { PlacedRoom } from "../../../../utils/world";
import { ENGINE_COLORS, engineLabel } from "../../constants";
import type { SceneFrame } from "../../scene";
import { lookFor, lookKey, renderFace } from "../../scene/pixel";

export interface FloorOverlayHandle {
	setFrame: (frame: SceneFrame) => void;
}

interface FloorOverlayProps {
	teammates: Teammate[];
	rooms: PlacedRoom[];
	selectedId: string | null;
	meId: string | null;
	onSelectTeammate: (id: string) => void;
	onSelectRoom: (id: string) => void;
}

const PILL_GAP = 6;
const PILL_ROW = 32;
const SIGN_LIFT = 36;

export const FloorOverlay = forwardRef<FloorOverlayHandle, FloorOverlayProps>(
	function FloorOverlay(
		{ teammates, rooms, selectedId, meId, onSelectTeammate, onSelectRoom },
		ref,
	) {
		const actorNodes = useRef(new Map<string, HTMLDivElement>());
		const signNodes = useRef(new Map<string, HTMLDivElement>());

		useImperativeHandle(ref, () => ({
			setFrame(frame) {
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
						const overlapsY = Math.abs(box.bottom - other.bottom) < PILL_ROW;
						if (overlapsX && overlapsY) box.bottom = other.bottom - PILL_ROW;
					}
					placed.push(box);
					node.style.transform = `translate(${actor.x}px, ${box.bottom}px)`;
					node.style.visibility = "visible";
				}
				for (const sign of frame.signs) {
					const node = signNodes.current.get(sign.roomId);
					if (!node) continue;
					node.style.transform = `translate(${sign.x}px, ${sign.y - SIGN_LIFT}px)`;
					node.style.visibility = "visible";
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

		const faces = useMemo(
			() =>
				new Map(
					teammates.map((t) => {
						const look = lookFor(t.id);
						return [t.id, renderFace(look, lookKey(look))];
					}),
				),
			[teammates],
		);

		return (
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				{rooms.map((room) => (
					<div
						key={room.id}
						ref={bindSign(room.id)}
						className="invisible absolute left-0 top-0 will-change-transform"
					>
						<button
							type="button"
							onClick={() => onSelectRoom(room.id)}
							className="pointer-events-auto -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-popover/90 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-foreground shadow-sm backdrop-blur hover:bg-fill-hover"
						>
							<span className="text-muted-foreground">[ </span>
							{room.name}
							<span className="text-muted-foreground"> ]</span>
						</button>
					</div>
				))}
				{teammates.map((t) => {
					const isMe = t.id === meId;
					const color = ENGINE_COLORS[t.engine ?? "human"];
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
									<div className="relative max-w-[220px] rounded-xl border border-border bg-popover px-3 py-1.5 text-[12px] leading-snug text-foreground shadow-md">
										{line}
										<span className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-b border-r border-border bg-popover" />
									</div>
								) : null}
								<button
									type="button"
									onClick={() => onSelectTeammate(t.id)}
									className={cn(
										"pointer-events-auto flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[12px] font-medium shadow-md backdrop-blur transition-transform hover:scale-[1.03]",
										isMe
											? "border-foreground bg-foreground text-background"
											: "border-border bg-popover/95 text-foreground",
										t.id === selectedId &&
											"ring-2 ring-ring ring-offset-1 ring-offset-background",
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
									<span className={cn(isMe && "pl-1.5")}>
										{isMe ? "You" : t.name}
									</span>
									{t.kind === "ai" ? (
										<span
											className="rounded-[4px] px-1 font-mono text-[9px] uppercase tracking-[0.06em]"
											style={{ color, background: `${color}22` }}
											title={engineLabel(t.engine)}
										>
											{engineLabel(t.engine).slice(0, 2)}
										</span>
									) : null}
									<span
										className="size-2 rounded-full"
										style={{
											background: away
												? "transparent"
												: t.paused
													? "#f5b942"
													: "#39d353",
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
