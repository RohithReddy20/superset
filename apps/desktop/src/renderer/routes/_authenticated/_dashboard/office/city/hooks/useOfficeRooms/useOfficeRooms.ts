import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { OfficeRoomRef } from "../../types";
import { cityQueryKey } from "../useCity";

/** Office rooms a CLI agent can sit in, from the city state `useCity` keeps fresh. */
export function useOfficeRooms(): OfficeRoomRef[] {
	const { activeHostUrl } = useLocalHostService();
	const { data } = useQuery({
		queryKey: cityQueryKey(activeHostUrl),
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("No local host");
			return getHostServiceClientByUrl(activeHostUrl).office.cityState.query();
		},
	});
	return data?.officeRooms ?? [];
}
