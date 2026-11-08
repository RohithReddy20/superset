import { useQueries } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { CityAgent } from "../../types";

const POLL_MS = 2000;
const MAX_CHARS = 6000;

export interface AgentTranscript {
	text: string;
	source: "harness" | "stream" | "screen";
}

type Target = Pick<CityAgent, "terminalId" | "workspaceId">;

export function transcriptQueryKey(hostUrl: string | null, terminalId: string) {
	return ["city", "transcript", hostUrl, terminalId] as const;
}

/** Each agent's recent conversation (or terminal output when it keeps no record), kept fresh. */
export function useAgentTranscripts(agents: Target[]) {
	const { activeHostUrl } = useLocalHostService();
	return useQueries({
		queries: agents.map((agent) => ({
			queryKey: transcriptQueryKey(activeHostUrl, agent.terminalId),
			enabled: !!activeHostUrl,
			refetchInterval: POLL_MS,
			queryFn: async (): Promise<AgentTranscript> => {
				if (!activeHostUrl) throw new Error("No local host");
				const result = await getHostServiceClientByUrl(
					activeHostUrl,
				).terminal.transcript.query({
					terminalId: agent.terminalId,
					workspaceId: agent.workspaceId,
					maxChars: MAX_CHARS,
				});
				return { text: result.text, source: result.source };
			},
		})),
	});
}
