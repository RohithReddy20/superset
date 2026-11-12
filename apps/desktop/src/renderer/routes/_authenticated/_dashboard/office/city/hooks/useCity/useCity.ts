import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import type { CityHandover, CityProject, CityRoom } from "../../types";
import { buildCity } from "../../utils/buildCity";
import { useAgentScreens } from "../useAgentScreens";
import {
	CITY_FALLBACK_POLL_MS,
	CITY_QUERY_ROOT,
	useCityLive,
} from "../useCityLive";

export function cityQueryKey(hostUrl: string | null) {
	return [CITY_QUERY_ROOT, "rooms", hostUrl] as const;
}

/** This machine's projects and workspaces, the agents running in them, and where they sit, kept live. */
export function useCity(): {
	projects: CityProject[];
	rooms: CityRoom[];
	handovers: CityHandover[];
	/** The name the next agent gets when the person gives none. */
	nextName: string;
	hostReady: boolean;
	ready: boolean;
	/** This machine's agents and their seats have loaded at least once. */
	agentsReady: boolean;
	/** The host stopped answering; what is shown is what was last seen. */
	hostTrouble: boolean;
	/** A request to the host is under way. */
	asking: boolean;
	askAgain: () => void;
} {
	const { activeHostUrl, machineId } = useLocalHostService();
	useCityLive();
	const { workspaces, isReady: workspacesReady } = useHostWorkspaces();
	const { projects, isReady: projectsReady } = useHostProjects();
	const seenAt = useV2NotificationStore((state) => state.terminalSeenAt);
	const client = activeHostUrl
		? getHostServiceClientByUrl(activeHostUrl)
		: null;

	const bindings = useQuery({
		queryKey: [CITY_QUERY_ROOT, "agents", activeHostUrl],
		enabled: !!client,
		queryFn: () => {
			if (!client) throw new Error("No local host");
			return client.terminalAgents.list.query();
		},
		refetchInterval: CITY_FALLBACK_POLL_MS,
		placeholderData: keepPreviousData,
	});
	const rooms = useQuery({
		queryKey: cityQueryKey(activeHostUrl),
		enabled: !!client,
		queryFn: () => {
			if (!client) throw new Error("No local host");
			return client.office.cityState.query();
		},
		refetchInterval: CITY_FALLBACK_POLL_MS,
		placeholderData: keepPreviousData,
	});

	const watched = useMemo(
		() =>
			(bindings.data ?? []).filter(
				(b) =>
					!b.chatSessionId &&
					(b.lastEventType === "Attached" || b.lastEventType === "Start"),
			),
		[bindings.data],
	);
	const asks = useAgentScreens(watched);

	const city = useMemo(
		() =>
			buildCity({
				projects: projects.map((p) => ({
					id: p.id,
					name: p.name,
					color: p.color,
					iconUrl: resolveProjectIconUrl(p),
					createdAt: p.createdAt,
					here: !!machineId && p.hostIds.includes(machineId),
				})),
				workspaces,
				bindings: bindings.data ?? [],
				seats: rooms.data?.seats ?? [],
				names: rooms.data?.names ?? [],
				lost: rooms.data?.lost ?? [],
				asks,
				seenAt,
				machineId,
			}),
		[
			projects,
			workspaces,
			bindings.data,
			rooms.data?.seats,
			rooms.data?.names,
			rooms.data?.lost,
			asks,
			seenAt,
			machineId,
		],
	);

	return {
		projects: city,
		rooms: rooms.data?.rooms ?? [],
		nextName: rooms.data?.nextName ?? "",
		handovers: rooms.data?.handovers ?? [],
		hostReady: !!activeHostUrl,
		ready: workspacesReady && projectsReady && bindings.isSuccess,
		agentsReady: bindings.isSuccess && rooms.isSuccess,
		hostTrouble:
			!activeHostUrl ||
			bindings.failureCount > 0 ||
			rooms.failureCount > 0 ||
			bindings.isError ||
			rooms.isError,
		asking: bindings.isFetching || rooms.isFetching,
		askAgain: () => {
			void bindings.refetch();
			void rooms.refetch();
		},
	};
}
