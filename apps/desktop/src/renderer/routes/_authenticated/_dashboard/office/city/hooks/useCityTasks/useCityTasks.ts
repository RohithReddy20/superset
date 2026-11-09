import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { CityTask } from "../../types";

const POLL_MS = 1500;

/** Tasks given to the city's agents, kept live, and what a person can do with them. */
export function useCityTasks() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const queryKey = ["city", "tasks", activeHostUrl] as const;
	const client = () => {
		if (!activeHostUrl) throw new Error("No local host");
		return getHostServiceClientByUrl(activeHostUrl).office;
	};
	const query = useQuery({
		queryKey,
		enabled: !!activeHostUrl,
		queryFn: () => client().cityTasks.query(),
		refetchInterval: POLL_MS,
	});
	const then = async <T>(promise: Promise<T>): Promise<T> => {
		try {
			return await promise;
		} finally {
			void queryClient.invalidateQueries({ queryKey });
		}
	};
	const tasks: CityTask[] = query.data?.tasks ?? [];

	return {
		tasks,
		checkCommands: query.data?.checkCommands ?? {},
		give: (input: {
			terminalId: string;
			title: string;
			brief: string;
			checkCommand?: string;
			checker?: "claude" | "codex";
		}) => then(client().cityTaskGive.mutate(input)),
		sendBack: (id: string, note: string) =>
			then(client().cityTaskSendBack.mutate({ id, note })),
		askForPullRequest: (id: string) =>
			then(client().cityTaskPullRequest.mutate({ id })),
		close: (id: string) => then(client().cityTaskClose.mutate({ id })),
		cancel: (id: string) => then(client().cityTaskCancel.mutate({ id })),
	};
}
