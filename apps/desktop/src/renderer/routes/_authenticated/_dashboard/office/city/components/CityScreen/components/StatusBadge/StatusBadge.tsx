import { cn } from "@superset/ui/utils";
import { STATUS_COLORS, STATUS_LABELS } from "../../../../constants";
import type { AgentStatus } from "../../../../types";

export function StatusBadge({ status }: { status: AgentStatus }) {
	return (
		<span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]">
			<span
				className={cn(
					"size-1.5 rounded-full",
					status === "permission" && "motion-safe:animate-pulse",
				)}
				style={{ background: STATUS_COLORS[status] }}
			/>
			{STATUS_LABELS[status]}
		</span>
	);
}
