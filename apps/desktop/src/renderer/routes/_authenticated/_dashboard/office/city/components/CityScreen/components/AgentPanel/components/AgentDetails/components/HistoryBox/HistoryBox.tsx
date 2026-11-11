import { formatRelativeTime } from "@superset/i18n/format";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { LongText } from "../../../../../../../../../components/LongText";
import { CITY_QUERY_ROOT } from "../../../../../../../../hooks/useCityLive";
import type { CityAgent } from "../../../../../../../../types";

/** What happened with this agent in the team, oldest first; folded until asked for. */
export function HistoryBox({ agent }: { agent: CityAgent }) {
	const { activeHostUrl } = useLocalHostService();
	const [open, setOpen] = useState(false);
	const history = useQuery({
		queryKey: [CITY_QUERY_ROOT, "timeline", activeHostUrl, agent.terminalId],
		enabled: open && !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("No local host");
			return getHostServiceClientByUrl(activeHostUrl).office.teamTimeline.query(
				{ id: agent.terminalId },
			);
		},
	});
	const Chevron = open ? LuChevronDown : LuChevronRight;

	return (
		<div className="flex flex-col gap-1.5 rounded-md border border-border p-2 text-[12px]">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((was) => !was)}
				className="flex items-center gap-1 text-left text-muted-foreground hover:text-foreground"
			>
				<Chevron className="size-3.5" />
				History with the team
			</button>
			{open ? (
				history.data?.length ? (
					<ol className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
						{history.data.map((entry, index) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: entries are append-only and have no id
								key={index}
								className="flex flex-col"
							>
								<span className="text-[10px] text-muted-foreground">
									{formatRelativeTime(entry.at)}
								</span>
								<LongText text={entry.text} />
							</li>
						))}
					</ol>
				) : (
					<p className="text-muted-foreground">
						{history.isLoading ? "Loading…" : "Nothing yet."}
					</p>
				)
			) : null}
		</div>
	);
}
