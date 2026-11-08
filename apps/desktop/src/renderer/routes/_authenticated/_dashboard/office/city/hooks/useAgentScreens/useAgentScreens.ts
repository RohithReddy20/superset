import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { CityAgent } from "../../types";
import { type ScreenAsk, screenAsk } from "../../utils/screenAsk";

const POLL_MS = 2500;
const SCREEN_LINES = 40;

type Target = Pick<CityAgent, "terminalId" | "workspaceId">;

/** The question each agent shows on its screen right now, if any, read off its terminal. */
export function useAgentScreens(
	agents: Target[],
): ReadonlyMap<string, ScreenAsk> {
	const { activeHostUrl } = useLocalHostService();
	const results = useQueries({
		queries: agents.map((agent) => ({
			queryKey: ["city", "screen", activeHostUrl, agent.terminalId],
			enabled: !!activeHostUrl,
			refetchInterval: POLL_MS,
			retry: false,
			queryFn: async () => {
				if (!activeHostUrl) throw new Error("No local host");
				const snapshot = await getHostServiceClientByUrl(
					activeHostUrl,
				).terminal.snapshot.query({
					terminalId: agent.terminalId,
					workspaceId: agent.workspaceId,
					maxLines: SCREEN_LINES,
				});
				return screenAsk(snapshot.text);
			},
		})),
	});
	const signature = JSON.stringify(
		agents.map((agent, i) => [agent.terminalId, results[i]?.data ?? null]),
	);
	return useMemo(() => {
		const rows = JSON.parse(signature) as Array<[string, ScreenAsk | null]>;
		return new Map(
			rows.flatMap(([id, ask]) => (ask ? [[id, ask] as const] : [])),
		);
	}, [signature]);
}
