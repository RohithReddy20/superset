import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import type { CityProject } from "../../types";
import { buildCity } from "../../utils/buildCity";

const POLL_MS = 1500;

/** This machine's projects and workspaces with the agents running in them, kept live. */
export function useCity(): {
	projects: CityProject[];
	hostReady: boolean;
	ready: boolean;
} {
	const { activeHostUrl, machineId } = useLocalHostService();
	const { workspaces, isReady: workspacesReady } = useHostWorkspaces();
	const { projects, isReady: projectsReady } = useHostProjects();
	const seenAt = useV2NotificationStore((state) => state.terminalSeenAt);

	const bindings = useQuery({
		queryKey: ["city", "agents", activeHostUrl],
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("No local host");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).terminalAgents.list.query();
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
				seenAt,
				machineId,
			}),
		[projects, workspaces, bindings.data, seenAt, machineId],
	);

	return {
		projects: city,
		hostReady: !!activeHostUrl,
		ready: workspacesReady && projectsReady && bindings.isSuccess,
	};
}
