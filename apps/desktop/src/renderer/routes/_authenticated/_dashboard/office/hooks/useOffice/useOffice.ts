import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { OfficeSnapshot, TaskStatus } from "../../types";

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

	const addRoom = useMutation({
		mutationFn: (input: { id: string; name: string; place?: string }) => {
			if (!client) throw new Error("No local host");
			return client.office.addRoom.mutate(input);
		},
		onSuccess: refresh,
	});

	const deleteRoom = useMutation({
		mutationFn: (input: { id: string }) => {
			if (!client) throw new Error("No local host");
			return client.office.deleteRoom.mutate(input);
		},
		onSuccess: refresh,
	});

	const setDesks = useMutation({
		mutationFn: (input: {
			desks: Array<{ id: string; zoneId: string; x: number; y: number }>;
		}) => {
			if (!client) throw new Error("No local host");
			return client.office.setDesks.mutate(input);
		},
		onSuccess: refresh,
	});

	const openGroup = useMutation({
		mutationFn: (input: { personId: string; memberIds: string[] }) => {
			if (!client) throw new Error("No local host");
			return client.office.openGroup.mutate(input);
		},
		onSuccess: refresh,
	});

	const moveTeammate = useMutation({
		mutationFn: (input: { id: string; roomId: string }) => {
			if (!client) throw new Error("No local host");
			return client.office.moveTeammate.mutate(input);
		},
		onSuccess: refresh,
	});

	const createTask = useMutation({
		mutationFn: (input: {
			by: string;
			title: string;
			brief: string;
			roomId: string;
			ownerId?: string | null;
			verifierId?: string | null;
		}) => {
			if (!client) throw new Error("No local host");
			return client.office.createTask.mutate(input);
		},
		onSuccess: refresh,
	});

	const assignTask = useMutation({
		mutationFn: (input: { by: string; id: string; ownerId: string }) => {
			if (!client) throw new Error("No local host");
			return client.office.assignTask.mutate(input);
		},
		onSuccess: refresh,
	});

	const updateTask = useMutation({
		mutationFn: (input: {
			by: string;
			id: string;
			status: TaskStatus;
			note: string;
		}) => {
			if (!client) throw new Error("No local host");
			return client.office.updateTask.mutate(input);
		},
		onSuccess: refresh,
	});

	return {
		state,
		say,
		setPaused,
		hire,
		addRoom,
		deleteRoom,
		setDesks,
		moveTeammate,
		openGroup,
		createTask,
		assignTask,
		updateTask,
		hostReady: !!client,
	};
}
