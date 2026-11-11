import { cn } from "@superset/ui/utils";
import { useRef } from "react";
import { LuListTodo, LuMail } from "react-icons/lu";
import type { Mood, Teammate } from "../../../../../../types";
import { EngineMark } from "../../../../../EngineMark";

interface NameTagProps {
	teammate: Teammate;
	isMe: boolean;
	face: string | undefined;
	/** An icon in place of the engine mark. */
	icon: string | undefined;
	/** The status dot's colour; unset uses here / paused / away. */
	dot: string | undefined;
	/** What the dot means, read out with the name. */
	statusLabel: string | undefined;
	mood: Mood | undefined;
	/** Items open on its own list, and messages waiting to reach it. */
	count: { open: number; waiting: number } | undefined;
	/** Its panel is open, or it is one of several picked. */
	marked: boolean;
	canCarry: boolean;
	/** `additive` is a Shift, Cmd or Ctrl click. */
	onClick: (additive: boolean) => void;
	onCarryStart: () => void;
	/** Client coordinates of the pointer while the tag is dragged. */
	onCarryMove: (clientX: number, clientY: number) => void;
	onCarryEnd: () => void;
}

const DRAG_START = 5;
const URGENT = new Set<Mood>(["needs-you", "failed"]);

/** A person's name over their head, with what they are on above it; dragging it carries them. */
export function NameTag({
	teammate: t,
	isMe,
	face,
	icon,
	dot,
	statusLabel,
	mood,
	count,
	marked,
	canCarry,
	onClick,
	onCarryStart,
	onCarryMove,
	onCarryEnd,
}: NameTagProps) {
	const press = useRef<{ x: number; y: number; carrying: boolean } | null>(
		null,
	);
	const away = t.presence === "away";
	const busy = t.presence === "focused" || t.presence === "in-meeting" || away;
	const line = busy && t.line ? t.line : "";
	const urgent = !!mood && URGENT.has(mood);

	return (
		<div
			data-marked={marked}
			className="group/tag flex flex-col items-center gap-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
		>
			{line ? (
				<div
					key={line}
					className={cn(
						"max-w-[190px] truncate rounded-md border bg-popover px-2 py-0.5 text-[11px] leading-snug shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200",
						"group-hover/tag:max-w-[260px] group-hover/tag:whitespace-normal group-data-[marked=true]/tag:max-w-[260px] group-data-[marked=true]/tag:whitespace-normal",
						"group-data-[compact=true]/floor:max-w-[120px] group-data-[compact=true]/floor:px-1.5 group-data-[compact=true]/floor:text-[10px]",
						urgent
							? "border-orange-500/60 text-foreground"
							: "border-border text-muted-foreground group-hover/tag:text-foreground group-data-[marked=true]/tag:text-foreground",
						away && "opacity-70",
					)}
				>
					{urgent ? (
						<span className="mr-1 inline-block size-1.5 rounded-full bg-orange-500 align-middle motion-safe:animate-pulse" />
					) : null}
					{line}
				</div>
			) : null}
			<button
				type="button"
				onPointerDown={(event) => {
					if (isMe || !canCarry || event.button !== 0) return;
					press.current = {
						x: event.clientX,
						y: event.clientY,
						carrying: false,
					};
					event.currentTarget.setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					const held = press.current;
					if (!held) return;
					if (!held.carrying) {
						const moved = Math.hypot(
							event.clientX - held.x,
							event.clientY - held.y,
						);
						if (moved < DRAG_START) return;
						held.carrying = true;
						onCarryStart();
					}
					onCarryMove(event.clientX, event.clientY);
				}}
				onPointerUp={() => {
					if (press.current?.carrying) onCarryEnd();
				}}
				onPointerCancel={() => {
					if (press.current?.carrying) onCarryEnd();
					press.current = null;
				}}
				aria-label={
					statusLabel ? `${isMe ? "You" : t.name}, ${statusLabel}` : undefined
				}
				aria-pressed={isMe ? undefined : marked}
				title={
					isMe
						? "You. The arrow keys walk you around."
						: [
								t.name,
								t.from ? `works in ${t.from}` : "",
								statusLabel ?? "",
								line,
							]
								.filter(Boolean)
								.join(" · ")
				}
				onClick={(event) => {
					const carried = press.current?.carrying;
					press.current = null;
					if (carried) return;
					onClick(event.shiftKey || event.metaKey || event.ctrlKey);
				}}
				className={cn(
					"pointer-events-auto flex touch-none items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[12px] font-medium shadow-md backdrop-blur transition-[box-shadow,background-color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[compact=true]/floor:gap-1 group-data-[compact=true]/floor:pr-1",
					!isMe && canCarry && "cursor-grab active:cursor-grabbing",
					isMe
						? "border-foreground bg-foreground text-background"
						: "border-border bg-popover/95 text-foreground hover:bg-popover",
					away && "opacity-60",
					marked && "border-[#5ec8ff] ring-2 ring-[#5ec8ff]/70",
				)}
			>
				{isMe ? null : (
					<img
						src={face}
						alt=""
						className="size-5 rounded-full bg-muted object-cover"
						draggable={false}
					/>
				)}
				{isMe ? null : icon ? (
					<img
						src={icon}
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
						"max-w-[120px] truncate",
						isMe ? "pl-1.5" : "group-data-[compact=true]/floor:hidden",
					)}
				>
					{isMe ? "You" : t.name}
				</span>
				{t.from ? (
					<span className="max-w-[84px] truncate text-[11px] font-normal text-muted-foreground group-data-[compact=true]/floor:hidden">
						from {t.from}
					</span>
				) : null}
				{count && count.open > 0 ? (
					<span className="flex items-center gap-0.5 rounded-full bg-muted px-1 text-[10px] tabular-nums text-muted-foreground group-data-[compact=true]/floor:hidden">
						<LuListTodo className="size-2.5" />
						{count.open}
					</span>
				) : null}
				{count && count.waiting > 0 ? (
					<span className="flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1 text-[10px] tabular-nums text-amber-600 dark:text-amber-400 group-data-[compact=true]/floor:hidden">
						<LuMail className="size-2.5" />
						{count.waiting}
					</span>
				) : null}
				<span
					className={cn(
						"size-2 shrink-0 rounded-full",
						urgent && "motion-safe:animate-pulse",
					)}
					style={{
						background:
							dot ?? (away ? "transparent" : t.paused ? "#f5b942" : "#39d353"),
						boxShadow: away && !dot ? "0 0 0 1px currentColor" : undefined,
					}}
				/>
			</button>
		</div>
	);
}
