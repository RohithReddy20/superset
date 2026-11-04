import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { OfficeSnapshot } from "../../types";

const POLL_MS = 1000;

export function useOffice() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const queryKey = ["office", activeHostUrl] as const;
	const client = activeHostUrl
		? getHostServiceClientByUrl(activeHostUrl)
		: null;

	const state = useQuery<OfficeSnapshot>({
		queryKey,
		enabled: !!client,
		queryFn: () => {
			if (!client) throw new Error("No local host");
			return client.office.state.query();
		},
		refetchInterval: POLL_MS,
	});

	const refresh = () => queryClient.invalidateQueries({ queryKey });

	const say = useMutation({
		mutationFn: (input: {
			authorId: string;
			roomId: string;
			threadId?: string | null;
			text: string;
		}) => {
			if (!client) throw new Error("No local host");
			return client.office.say.mutate(input);
		},
		onSuccess: refresh,
	});

	const setPaused = useMutation({
		mutationFn: (input: { id: string; paused: boolean }) => {
			if (!client) throw new Error("No local host");
			return client.office.setPaused.mutate(input);
		},
		onSuccess: refresh,
	});

	const hire = useMutation({
		mutationFn: (input: {
			id: string;
			name: string;
			role: string;
			room: string;
			engine: "claude" | "codex" | "agy";
			model?: string;
		}) => {
			if (!client) throw new Error("No local host");
			return client.office.hire.mutate(input);
		},
		onSuccess: refresh,
	});

	return { state, say, setPaused, hire, hostReady: !!client };
}
