import { useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { CityPlace } from "../../types";
import { cityQueryKey } from "../useCity";

/** Seating agents and talking in rooms; each call refreshes the city once it lands. */
export function useCityActions() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const client = () => {
		if (!activeHostUrl) throw new Error("No local host");
		return getHostServiceClientByUrl(activeHostUrl).office;
	};
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: cityQueryKey(activeHostUrl) });
	const then = async <T>(promise: Promise<T>): Promise<T> => {
		try {
			return await promise;
		} finally {
			void refresh();
		}
	};

	return {
		seat: (terminalId: string, place: CityPlace) =>
			then(client().citySeat.mutate({ terminalId, ...place })),
		sendHome: (terminalId: string) =>
			then(client().cityHome.mutate({ terminalId })),
		say: (place: CityPlace, text: string) =>
			then(client().citySay.mutate({ ...place, text })),
		resume: (place: CityPlace) => then(client().cityResume.mutate(place)),
		handOver: (input: {
			terminalId: string;
			toWorkspaceId: string;
			agent?: string;
			note?: string;
		}) => then(client().cityHandOver.mutate(input)),
		approveHandover: (input: {
			id: string;
			toWorkspaceId: string;
			agent?: string;
			note?: string;
		}) => then(client().cityHandoverApprove.mutate(input)),
		declineHandover: (id: string) =>
			then(client().cityHandoverDecline.mutate({ id })),
		cancelHandover: (id: string) =>
			then(client().cityHandoverCancel.mutate({ id })),
		/** Starts a CLI in a workspace's folder under a new name, told who it is. */
		startAgent: (input: {
			workspaceId: string;
			agent: string;
			prompt: string;
		}) => then(client().cityStart.mutate(input)),
		rename: (terminalId: string, name: string) =>
			then(client().cityRename.mutate({ terminalId, name })),
		/** Continues a disconnected agent's conversation in a new terminal; resolves once the city shows it there. */
		reconnect: async (terminalId: string) => {
			const result = await then(client().cityReconnect.mutate({ terminalId }));
			await refresh();
			return result;
		},
		/** Ends a disconnected agent for good and takes it out of the city. */
		remove: (terminalId: string) =>
			then(client().cityRemove.mutate({ terminalId })),
	};
}
