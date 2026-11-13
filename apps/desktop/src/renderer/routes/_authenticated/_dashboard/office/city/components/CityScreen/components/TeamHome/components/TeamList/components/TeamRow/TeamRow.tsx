import { formatCompactRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import {
	STATUS_COLORS,
	STATUS_LABELS,
} from "../../../../../../../../constants";
import type { CityAgent } from "../../../../../../../../types";
import { AgentFace } from "../../../../../AgentFace";
import { AgentIcon } from "../../../../../AgentIcon";
import { AGENT_DRAG_TYPE } from "../../constants";
import type { AgentLine, AgentLineTone } from "../../utils/agentLine";

const TONES: Record<AgentLineTone, string> = {
	needsYou: "text-orange-500",
	waiting: "text-sky-600 dark:text-sky-400",
	doing: "text-foreground",
	done: "text-green-600 dark:text-green-400",
	quiet: "text-muted-foreground",
};

interface TeamRowProps {
	agent: CityAgent;
	line: AgentLine;
	/** The workspace it works in, when it sits in another room. */
	from?: string;
	selected: boolean;
	now: number;
	onSelect: () => void;
}

/** One teammate: its face, its state as a dot, and one line on what it is at. Drag it to seat it in another room. */
export function TeamRow({
	agent,
	line,
	from,
	selected,
	now,
	onSelect,
}: TeamRowProps) {
	return (
		<button
			type="button"
			draggable
			data-team-row={agent.terminalId}
			aria-current={selected ? "true" : undefined}
			onClick={onSelect}
			onDragStart={(event) => {
				event.dataTransfer.setData(AGENT_DRAG_TYPE, agent.terminalId);
				event.dataTransfer.effectAllowed = "move";
			}}
			className={cn(
				"flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
				selected && "bg-fill-selected hover:bg-fill-selected",
			)}
		>
			<span className="relative mt-0.5 shrink-0">
				<AgentFace name={agent.name} className="size-7" />
				<span
					title={STATUS_LABELS[agent.status]}
					className={cn(
						"absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
						agent.status === "permission" && "motion-safe:animate-pulse",
					)}
					style={{ background: STATUS_COLORS[agent.status] }}
				/>
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="truncate text-[13px] font-medium">{agent.name}</span>
					<AgentIcon agentId={agent.agentId} className="size-3" />
					<span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
						{formatCompactRelativeTime(
							agent.lastEventAt,
							Math.max(now, agent.lastEventAt),
						)}
					</span>
				</span>
				<span
					title={line.text}
					className={cn(
						"line-clamp-2 break-words text-[12px] leading-snug",
						TONES[line.tone],
					)}
				>
					{line.text}
				</span>
				{from ? (
					<span className="truncate text-[11px] text-muted-foreground">
						works in {from}
					</span>
				) : null}
			</span>
		</button>
	);
}
