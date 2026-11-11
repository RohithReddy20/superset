import { formatRelativeTime } from "@superset/i18n/format";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { LongText } from "../../../../../../../../../components/LongText";
import { CITY_QUERY_ROOT } from "../../../../../../../../hooks/useCityLive";
import type { CityAgent } from "../../../../../../../../types";

/** What happened with this agent in the team, newest first. */
export function HistoryBox({ agent }: { agent: CityAgent }) {
	const { activeHostUrl } = useLocalHostService();
	const history = useQuery({
		queryKey: [CITY_QUERY_ROOT, "timeline", activeHostUrl, agent.terminalId],
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("No local host");
			return getHostServiceClientByUrl(activeHostUrl).office.teamTimeline.query(
				{ id: agent.terminalId },
			);
		},
	});
	const entries = history.data ? [...history.data].reverse() : [];

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 text-[12px]">
			{entries.length === 0 ? (
				<p className="text-muted-foreground">
					{history.isLoading
						? "Loading…"
						: history.isError
							? "Could not read the history. It is tried again shortly."
							: `Nothing yet. What ${agent.name} is asked, takes on and writes to the team shows here.`}
				</p>
			) : (
				<ol className="flex flex-col">
					{entries.map((entry, index) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: entries are append-only and have no id
							key={entries.length - index}
							className="relative flex flex-col gap-0.5 border-l border-border pb-3 pl-3 last:pb-0"
						>
							<span className="absolute -left-[3px] top-1.5 size-[5px] rounded-full bg-muted-foreground/60" />
							<span className="text-[10px] text-muted-foreground">
								{formatRelativeTime(entry.at)}
							</span>
							<LongText text={entry.text} />
						</li>
					))}
				</ol>
			)}
		</div>
	);
}
