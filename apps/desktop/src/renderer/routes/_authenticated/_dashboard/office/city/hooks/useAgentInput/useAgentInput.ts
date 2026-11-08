import { useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { CityAgent } from "../../types";
import { transcriptQueryKey } from "../useAgentTranscript";

type Target = Pick<CityAgent, "terminalId" | "workspaceId">;

export const KEYS = {
	up: "\x1b[A",
	down: "\x1b[B",
	enter: "\r",
	escape: "\x1b",
} as const;

export type Key = keyof typeof KEYS;

/** Types into agents' terminals: a message submitted as a prompt, or a single key for a question on screen. */
export function useAgentInput() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const client = () => {
		if (!activeHostUrl) throw new Error("No local host");
		return getHostServiceClientByUrl(activeHostUrl);
	};
	const refresh = (agent: Target) =>
		queryClient.invalidateQueries({
			queryKey: transcriptQueryKey(activeHostUrl, agent.terminalId),
		});

	return {
		async send(agent: Target, text: string): Promise<void> {
			await client().terminal.send.mutate({
				terminalId: agent.terminalId,
				workspaceId: agent.workspaceId,
				text,
				submit: true,
			});
			void refresh(agent);
		},
		async press(agent: Target, key: Key): Promise<void> {
			await client().terminal.writeInput.mutate({
				terminalId: agent.terminalId,
				workspaceId: agent.workspaceId,
				data: KEYS[key],
			});
			void refresh(agent);
		},
	};
}
