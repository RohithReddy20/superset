import { formatCompactRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";
import {
	LuArrowRightLeft,
	LuBan,
	LuCircleAlert,
	LuCircleCheck,
	LuEye,
	LuHand,
	LuMessageCircle,
	LuMessageCircleQuestion,
	LuUnplug,
} from "react-icons/lu";
import type { NeedsYouItem, NeedsYouReason } from "../../../../utils/needsYou";

const REASONS: Record<
	NeedsYouReason,
	{ label: string; icon: IconType; tone: string }
> = {
	permission: {
		label: "Needs your OK",
		icon: LuHand,
		tone: "text-orange-500 border-orange-500/40 bg-orange-500/10",
	},
	failed: {
		label: "Stopped with an error",
		icon: LuCircleAlert,
		tone: "text-red-500 border-red-500/40 bg-red-500/10",
	},
	asked: {
		label: "Asks you for something",
		icon: LuMessageCircleQuestion,
		tone: "text-orange-500 border-orange-500/40 bg-orange-500/10",
	},
	wrote: {
		label: "Wrote to you",
		icon: LuMessageCircle,
		tone: "text-sky-500 border-sky-500/40 bg-sky-500/10",
	},
	handover: {
		label: "Asks to hand over its work",
		icon: LuArrowRightLeft,
		tone: "text-amber-500 border-amber-500/40 bg-amber-500/10",
	},
	lost: {
		label: "Disconnected",
		icon: LuUnplug,
		tone: "text-muted-foreground border-border bg-muted",
	},
	blocked: {
		label: "Task blocked",
		icon: LuBan,
		tone: "text-red-500 border-red-500/40 bg-red-500/10",
	},
	verified: {
		label: "Checked, ready to close",
		icon: LuCircleCheck,
		tone: "text-green-500 border-green-500/40 bg-green-500/10",
	},
	review: {
		label: "Done, take a look",
		icon: LuEye,
		tone: "text-green-500 border-green-500/40 bg-green-500/10",
	},
};

export function NeedsYouChip({
	item,
	onOpen,
}: {
	item: NeedsYouItem;
	onOpen: () => void;
}) {
	const reason = REASONS[item.reason];
	const Icon = reason.icon;
	const label = item.note ?? reason.label;
	return (
		<button
			type="button"
			onClick={onOpen}
			title={`${item.title}: ${label} (${item.where})`}
			className="flex h-7 max-w-[440px] items-center gap-1.5 rounded-full border border-border bg-popover pl-1 pr-2.5 text-[12px] hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<span
				className={cn(
					"flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
					reason.tone,
				)}
			>
				<Icon
					className={cn(
						"size-3",
						item.reason === "permission" && "motion-safe:animate-pulse",
					)}
				/>
				<span className="max-w-[220px] truncate">{label}</span>
			</span>
			<span className="shrink-0 font-medium text-foreground">{item.title}</span>
			<span className="min-w-0 truncate text-muted-foreground">
				{item.where}
			</span>
			<span className="shrink-0 text-[11px] text-muted-foreground">
				{formatCompactRelativeTime(item.since)}
			</span>
		</button>
	);
}
