import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { LuX } from "react-icons/lu";
import type { Handoff, Room, Teammate } from "../../types";
import { formatUsage } from "../../utils/formatUsage";
import { EngineMark } from "../EngineMark";
import { ENGINE_COLORS, engineLabel } from "../OfficeFloor/constants";

interface TeammateCardProps {
	teammate: Teammate;
	handoffs: Handoff[];
	rooms: Room[];
	names: Map<string, string>;
	onClose: () => void;
	onTogglePaused: (paused: boolean) => void;
	onMove: (roomId: string) => void;
}

export function TeammateCard({
	teammate: t,
	handoffs,
	rooms,
	names,
	onClose,
	onTogglePaused,
	onMove,
}: TeammateCardProps) {
	const color = ENGINE_COLORS[t.engine ?? "human"];
	const mine = handoffs
		.filter((h) => h.fromId === t.id || h.toId === t.id)
		.slice(-5)
		.reverse();
	return (
		<div className="rounded-lg border border-border bg-card p-3">
			<div className="flex items-start gap-3">
				<span
					className="flex size-9 shrink-0 items-center justify-center rounded-full border font-mono text-xs"
					style={{ borderColor: color, color }}
				>
					{t.name.slice(0, 2).toUpperCase()}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<EngineMark engine={t.engine} className="size-4" />
						<span className="truncate text-sm font-medium text-foreground">
							{t.name}
						</span>
						{t.kind === "ai" ? (
							<span
								className="font-mono text-[10px] uppercase tracking-[0.08em]"
								style={{ color }}
							>
								{engineLabel(t.engine)}
								{t.model ? ` · ${t.model}` : ""}
							</span>
						) : (
							<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
								person
							</span>
						)}
					</div>
					<p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
						{t.role}
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={onClose}
					aria-label="Close"
				>
					<LuX className="size-3.5" />
				</Button>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
				<div className="rounded-md bg-muted/50 px-2 py-1.5">
					<div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
						now
					</div>
					<div className="truncate text-foreground">{t.line || t.presence}</div>
				</div>
				{t.kind === "ai" ? (
					<div className="rounded-md bg-muted/50 px-2 py-1.5">
						<div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
							today
						</div>
						<div className="text-foreground">
							{t.budget.usedToday} / {t.budget.dailyTurns} turns
						</div>
						{t.usage ? (
							<div className="text-[11px] text-muted-foreground">
								{formatUsage(t.usage)}
							</div>
						) : null}
					</div>
				) : null}
			</div>
			{mine.length > 0 ? (
				<div className="mt-3">
					<div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
						hand-offs
					</div>
					<ul className="flex flex-col gap-1 text-[12px]">
						{mine.map((h) => (
							<li key={h.id} className="flex items-baseline gap-1.5">
								<span className="text-foreground">
									{names.get(h.fromId) ?? h.fromId} →{" "}
									{names.get(h.toId) ?? h.toId}
								</span>
								<span
									className={
										h.status === "held"
											? "text-destructive"
											: "text-muted-foreground"
									}
								>
									{h.status}
									{h.reason ? `: ${h.reason}` : ""}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
			<div className="mt-3 flex items-center justify-between gap-2">
				<Select value={t.roomId} onValueChange={onMove}>
					<SelectTrigger className="h-8 w-[160px] text-xs">
						<SelectValue placeholder="Move to a room" />
					</SelectTrigger>
					<SelectContent>
						{rooms.map((r) => (
							<SelectItem key={r.id} value={r.id}>
								#{r.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{t.kind === "ai" ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onTogglePaused(!t.paused)}
					>
						{t.paused ? "Resume" : "Pause"}
					</Button>
				) : null}
			</div>
		</div>
	);
}
