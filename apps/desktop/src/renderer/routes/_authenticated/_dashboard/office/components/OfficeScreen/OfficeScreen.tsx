import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { LuListChecks, LuPlus, LuUserPlus } from "react-icons/lu";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useOffice } from "../../hooks/useOffice";
import { AddRoomDialog } from "../AddRoomDialog";
import { CreateTaskDialog } from "../CreateTaskDialog";
import { HireDialog } from "../HireDialog";
import { OfficeFloor } from "../OfficeFloor";
import { RightNowRail } from "../RightNowRail";
import { RoomFeed } from "../RoomFeed";
import { TaskBoard } from "../TaskBoard";
import { TeammateCard } from "../TeammateCard";

export function OfficeScreen() {
	const {
		state,
		say,
		setPaused,
		hire,
		addRoom,
		moveTeammate,
		createTask,
		assignTask,
		updateTask,
		hostReady,
	} = useOffice();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [roomId, setRoomId] = useState<string | null>(null);
	const [showLog, setShowLog] = useState(false);
	const [addingRoom, setAddingRoom] = useState(false);
	const [hiring, setHiring] = useState(false);
	const [creatingTask, setCreatingTask] = useState(false);
	const [showTasks, setShowTasks] = useState(false);
	const [openThreadId, setOpenThreadId] = useState<string | null>(null);

	const data = state.data;
	const rooms = useMemo(
		() => (data?.rooms ?? []).filter((r) => r.kind === "room"),
		[data?.rooms],
	);
	const activeRoom = rooms.find((r) => r.id === roomId) ?? rooms[0] ?? null;
	const me = data?.teammates.find((t) => t.kind === "human") ?? null;
	const selected = data?.teammates.find((t) => t.id === selectedId) ?? null;
	const names = useMemo(
		() => new Map((data?.teammates ?? []).map((t) => [t.id, t.name])),
		[data?.teammates],
	);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<PageHeader
				start={
					<div className="flex items-center gap-3">
						<span className="text-sm font-medium text-foreground">Office</span>
						{data ? (
							<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
								{data.teammates.filter((t) => t.presence !== "away").length}{" "}
								here ·{" "}
								{data.handoffs.filter((h) => h.status === "working").length}{" "}
								hand-offs open ·{" "}
								{
									data.tasks.filter(
										(t) => t.status !== "done" && t.status !== "blocked",
									).length
								}{" "}
								tasks moving
							</span>
						) : null}
					</div>
				}
				end={
					<div className="flex items-center gap-1">
						<HeaderButton
							onClick={() => setCreatingTask(true)}
							disabled={!data}
							icon={<LuPlus className="size-3.5" />}
						>
							task
						</HeaderButton>
						<HeaderButton
							onClick={() => setHiring(true)}
							disabled={!data}
							icon={<LuUserPlus className="size-3.5" />}
						>
							hire
						</HeaderButton>
						<HeaderButton
							onClick={() => setAddingRoom(true)}
							disabled={!data}
							icon={<LuPlus className="size-3.5" />}
						>
							room
						</HeaderButton>
						<HeaderButton
							active={showLog}
							onClick={() => setShowLog((v) => !v)}
						>
							seat log
						</HeaderButton>
					</div>
				}
			/>
			<div className="flex min-h-0 flex-1">
				<div className="relative min-w-0 flex-1 bg-muted">
					{!hostReady ? (
						<Empty text="Waiting for the local host…" />
					) : state.isError ? (
						<Empty
							text={`The office could not start: ${state.error.message}`}
						/>
					) : !data ? (
						<Empty text="Opening the office…" />
					) : (
						<div className="absolute inset-0">
							<OfficeFloor
								state={data}
								selectedId={selectedId}
								meId={me?.id ?? null}
								onSelectTeammate={(id) => setSelectedId(id)}
								onSelectRoom={(id) => setRoomId(id)}
								onMoveTeammates={async (ids, toRoomId) => {
									for (const id of ids)
										await moveTeammate.mutateAsync({ id, roomId: toRoomId });
								}}
								onSay={async (input) => {
									if (!me) throw new Error("No person here to send it");
									return say.mutateAsync({ authorId: me.id, ...input });
								}}
								onOpenThread={(inRoom, threadId) => {
									setShowTasks(false);
									setRoomId(inRoom);
									setOpenThreadId(threadId);
								}}
							/>
						</div>
					)}
					{showLog && data ? (
						<div className="absolute inset-x-6 bottom-8 max-h-48 overflow-y-auto rounded-md border border-border bg-card/95 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground backdrop-blur">
							{data.log.slice(-60).map((l) => (
								<div key={`${l.ts}-${l.seatId}-${l.text.slice(0, 20)}`}>
									<span className="text-foreground">[{l.seatId}]</span> {l.text}
								</div>
							))}
						</div>
					) : null}
				</div>
				<aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-background">
					<div className="border-b border-border px-3 py-3">
						<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
							Right now
						</div>
						{data ? (
							<RightNowRail
								teammates={data.teammates}
								selectedId={selectedId}
								onSelect={(id) => setSelectedId(id)}
							/>
						) : null}
					</div>
					{selected && data ? (
						<div className="border-b border-border p-3">
							<TeammateCard
								teammate={selected}
								handoffs={data.handoffs}
								rooms={rooms}
								names={names}
								onClose={() => setSelectedId(null)}
								onTogglePaused={(paused) =>
									setPaused.mutate({ id: selected.id, paused })
								}
								onMove={(targetRoomId) =>
									moveTeammate.mutate({ id: selected.id, roomId: targetRoomId })
								}
							/>
						</div>
					) : null}
					{data && activeRoom ? (
						<>
							<div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
								<button
									type="button"
									onClick={() => setShowTasks(true)}
									className={cn(
										"flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
										showTasks
											? "bg-fill-selected text-foreground"
											: "text-muted-foreground hover:bg-fill-hover",
									)}
								>
									<LuListChecks className="size-3" />
									tasks
									{data.tasks.some(
										(t) => t.status === "verified" || t.status === "blocked",
									) ? (
										<span className="size-1.5 rounded-full bg-[#39d353]" />
									) : null}
								</button>
								{rooms.map((r) => (
									<button
										type="button"
										key={r.id}
										onClick={() => {
											setShowTasks(false);
											setRoomId(r.id);
										}}
										className={cn(
											"shrink-0 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
											!showTasks && r.id === activeRoom.id
												? "bg-fill-selected text-foreground"
												: "text-muted-foreground hover:bg-fill-hover",
										)}
									>
										#{r.name}
									</button>
								))}
							</div>
							{showTasks ? (
								<div className="min-h-0 flex-1 overflow-y-auto">
									<TaskBoard
										tasks={data.tasks}
										teammates={data.teammates}
										me={me}
										pending={assignTask.isPending || updateTask.isPending}
										onOpenThread={(task) => {
											setShowTasks(false);
											setRoomId(task.roomId);
											setOpenThreadId(task.threadId);
										}}
										onAssign={(task, ownerId) =>
											assignTask.mutate({
												by: me?.id ?? "",
												id: task.id,
												ownerId,
											})
										}
										onUpdate={(task, status, note) =>
											updateTask.mutate({
												by: me?.id ?? "",
												id: task.id,
												status,
												note,
											})
										}
									/>
									{assignTask.error || updateTask.error ? (
										<p className="px-3 pb-2 text-xs text-destructive">
											{assignTask.error?.message ?? updateTask.error?.message}
										</p>
									) : null}
								</div>
							) : (
								<RoomFeed
									room={activeRoom}
									messages={data.messages}
									teammates={data.teammates}
									me={me}
									sending={say.isPending}
									openThreadId={openThreadId}
									onSend={(input) =>
										say.mutateAsync({ authorId: me?.id ?? "", ...input })
									}
								/>
							)}
						</>
					) : null}
				</aside>
			</div>
			<AddRoomDialog
				open={addingRoom}
				pending={addRoom.isPending}
				error={addRoom.error?.message ?? null}
				onOpenChange={(open) => {
					setAddingRoom(open);
					if (!open) addRoom.reset();
				}}
				onSubmit={(input) =>
					addRoom.mutate(input, {
						onSuccess: () => {
							setAddingRoom(false);
							setRoomId(input.id);
						},
					})
				}
			/>
			<CreateTaskDialog
				open={creatingTask}
				rooms={rooms}
				teammates={data?.teammates ?? []}
				defaultRoomId={activeRoom?.id ?? null}
				hasProject={!!data?.project}
				pending={createTask.isPending}
				error={createTask.error?.message ?? null}
				onOpenChange={(open) => {
					setCreatingTask(open);
					if (!open) createTask.reset();
				}}
				onSubmit={(input) =>
					createTask.mutate(
						{ by: me?.id ?? "", ...input },
						{
							onSuccess: () => {
								setCreatingTask(false);
								setShowTasks(true);
							},
						},
					)
				}
			/>
			<HireDialog
				open={hiring}
				rooms={rooms}
				pending={hire.isPending}
				error={hire.error?.message ?? null}
				onOpenChange={(open) => {
					setHiring(open);
					if (!open) hire.reset();
				}}
				onSubmit={(input) =>
					hire.mutate(input, {
						onSuccess: () => {
							setHiring(false);
							setSelectedId(input.id);
						},
					})
				}
			/>
		</div>
	);
}

function HeaderButton({
	children,
	icon,
	active,
	disabled,
	onClick,
}: {
	children: React.ReactNode;
	icon?: React.ReactNode;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors disabled:opacity-50",
				active
					? "bg-fill-selected text-foreground"
					: "text-muted-foreground hover:bg-fill-hover",
			)}
		>
			{icon}
			{children}
		</button>
	);
}

function Empty({ text }: { text: string }) {
	return (
		<div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
			{text}
		</div>
	);
}
