import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/** Every city query starts with this key, so one change refreshes them all. */
export const CITY_QUERY_ROOT = "city";
/** How often the city asks anyway, in case a change was not announced. */
export const CITY_FALLBACK_POLL_MS = 10_000;

const EVENTS = [
	"office:changed",
	"agent:lifecycle",
	"agent:bindings-changed",
	"terminal:lifecycle",
] as const;

/** Refreshes the city when the host says something changed, in place of asking every second. */
export function useCityLive(): void {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	useEffect(() => {
		if (!activeHostUrl) return;
		const bus = getHostEventBus(activeHostUrl);
		const refresh = () =>
			void queryClient.invalidateQueries({ queryKey: [CITY_QUERY_ROOT] });
		const removers = EVENTS.map((event) => bus.on(event, "*", refresh));
		const release = bus.retain();
		return () => {
			for (const remove of removers) remove();
			release();
		};
	}, [activeHostUrl, queryClient]);
}
