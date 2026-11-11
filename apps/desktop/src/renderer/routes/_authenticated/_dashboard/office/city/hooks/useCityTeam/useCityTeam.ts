import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { type CityNote, type CityTodo, YOU } from "../../types";
import { CITY_FALLBACK_POLL_MS, CITY_QUERY_ROOT } from "../useCityLive";

const NO_TODOS: CityTodo[] = [];
const NO_NOTES: CityNote[] = [];
const NO_WAITING: Array<{ id: string; toId: string; error?: string }> = [];

/** Everyone's own list and what they wrote to the person, kept live. */
export function useCityTeam() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const queryKey = [CITY_QUERY_ROOT, "team", activeHostUrl] as const;
	const client = () => {
		if (!activeHostUrl) throw new Error("No local host");
		return getHostServiceClientByUrl(activeHostUrl).office;
	};
	const query = useQuery({
		queryKey,
		enabled: !!activeHostUrl,
		queryFn: () => client().team.query(),
		refetchInterval: CITY_FALLBACK_POLL_MS,
	});
	const then = async <T>(promise: Promise<T>): Promise<T> => {
		try {
			return await promise;
		} finally {
			void queryClient.invalidateQueries({ queryKey });
		}
	};

	const notes = query.data?.notes ?? NO_NOTES;
	const readAt = query.data?.readAt;
	const toYou = useMemo(
		() => notes.filter((n) => n.toIds.includes(YOU) && !n.expectsReply),
		[notes],
	);
	const unread = useMemo(
		() => toYou.filter((n) => n.at > (readAt?.[n.fromId] ?? 0)),
		[toYou, readAt],
	);

	return {
		todos: query.data?.todos ?? NO_TODOS,
		toYou,
		unread,
		waiting: query.data?.waiting ?? NO_WAITING,
		markRead: (fromId: string) => then(client().teamRead.mutate({ fromId })),
		ask: (to: string, text: string) =>
			then(client().teamAsk.mutate({ to, text })),
		setTodo: (id: string, state: CityTodo["state"]) =>
			then(client().teamTodoSet.mutate({ id, state })),
	};
}
