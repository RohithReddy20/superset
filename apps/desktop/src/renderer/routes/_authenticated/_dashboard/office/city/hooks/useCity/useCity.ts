import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import type { CityHandover, CityProject, CityRoom } from "../../types";
import { buildCity } from "../../utils/buildCity";

const POLL_MS = 1500;

export function cityQueryKey(hostUrl: string | null) {
	return ["city", "rooms", hostUrl] as const;
}

/** This machine's projects and workspaces, the agents running in them, and where they sit, kept live. */
export function useCity(): {
	projects: CityProject[];
	rooms: CityRoom[];
	handovers: CityHandover[];
	maxRelays: number;
	hostReady: boolean;
	ready: boolean;
} {
	const { activeHostUrl, machineId } = useLocalHostService();
	const { workspaces, isReady: workspacesReady } = useHostWorkspaces();
	const { projects, isReady: projectsReady } = useHostProjects();
	const seenAt = useV2NotificationStore((state) => state.terminalSeenAt);
	const client = activeHostUrl
		? getHostServiceClientByUrl(activeHostUrl)
		: null;

	const bindings = useQuery({
		queryKey: ["city", "agents", activeHostUrl],
		enabled: !!client,
		queryFn: () => {
			if (!client) throw new Error("No local host");
			return client.terminalAgents.list.query();
		},
		refetchInterval: POLL_MS,
	});
	const rooms = useQuery({
		queryKey: cityQueryKey(activeHostUrl),
		enabled: !!client,
		queryFn: () => {
			if (!client) throw new Error("No local host");
			return client.office.cityState.query();
		},
		refetchInterval: POLL_MS,
	});

	const city = useMemo(
		() =>
			buildCity({
				projects: projects.map((p) => ({
					id: p.id,
					name: p.name,
					color: p.color,
					iconUrl: resolveProjectIconUrl(p),
					createdAt: p.createdAt,
				})),
				workspaces,
				bindings: bindings.data ?? [],
				seats: rooms.data?.seats ?? [],
				seenAt,
				machineId,
			}),
		[projects, workspaces, bindings.data, rooms.data?.seats, seenAt, machineId],
	);

	return {
		projects: city,
		rooms: rooms.data?.rooms ?? [],
		handovers: rooms.data?.handovers ?? [],
		maxRelays: rooms.data?.maxRelays ?? 0,
		hostReady: !!activeHostUrl,
		ready: workspacesReady && projectsReady && bindings.isSuccess,
	};
}
