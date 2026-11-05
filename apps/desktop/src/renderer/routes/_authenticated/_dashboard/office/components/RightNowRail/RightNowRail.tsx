import { cn } from "@superset/ui/utils";
import type { Teammate } from "../../types";
import { EngineMark } from "../EngineMark";
import { ENGINE_COLORS } from "../OfficeFloor/constants";

interface RightNowRailProps {
	teammates: Teammate[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}

const PRESENCE_LABEL: Record<Teammate["presence"], string> = {
	focused: "focused",
	"in-office": "in office",
	"in-meeting": "in a huddle",
	away: "away",
};

export function RightNowRail({
	teammates,
	selectedId,
	onSelect,
}: RightNowRailProps) {
	const ordered = [...teammates].sort((a, b) => {
		const rank = (t: Teammate) =>
			t.presence === "focused"
				? 0
				: t.presence === "in-meeting"
					? 1
					: t.presence === "in-office"
						? 2
						: 3;
		return rank(a) - rank(b) || a.name.localeCompare(b.name);
	});
	return (
		<div className="flex flex-col gap-1">
			{ordered.map((t) => {
				const color = ENGINE_COLORS[t.engine ?? "human"];
				const selected = selectedId === t.id;
				return (
					<button
						type="button"
						key={t.id}
						onClick={() => onSelect(t.id)}
						className={cn(
							"flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
							selected ? "bg-fill-selected" : "hover:bg-fill-hover",
						)}
					>
						<span
							className="mt-1.5 size-2 shrink-0 rounded-full"
							style={{
								background: t.presence === "away" ? "transparent" : color,
								boxShadow: `0 0 0 1px ${color}`,
								opacity:
									t.presence === "focused" || t.presence === "in-meeting"
										? 1
										: 0.55,
							}}
						/>
						<span className="min-w-0 flex-1">
							<span className="flex items-center gap-1.5">
								<EngineMark engine={t.engine} />
								<span className="truncate text-[13px] font-medium text-foreground">
									{t.name}
								</span>
								{t.paused ? (
									<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
										paused
									</span>
								) : null}
							</span>
							<span className="block truncate text-[12px] text-muted-foreground">
								{t.line || PRESENCE_LABEL[t.presence]}
							</span>
						</span>
					</button>
				);
			})}
		</div>
	);
}
