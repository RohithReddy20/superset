import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useOffice } from "../../hooks/useOffice";
import { OfficeFloor } from "../OfficeFloor";
import { RightNowRail } from "../RightNowRail";
import { RoomFeed } from "../RoomFeed";
import { TeammateCard } from "../TeammateCard";

export function OfficeScreen() {
	const { state, say, setPaused, hostReady } = useOffice();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [roomId, setRoomId] = useState<string | null>(null);
	const [showLog, setShowLog] = useState(false);

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
								hand-offs open
							</span>
						) : null}
					</div>
				}
				end={
					<button
						type="button"
						onClick={() => setShowLog((v) => !v)}
						className={cn(
							"rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors",
							showLog
								? "bg-fill-selected text-foreground"
								: "text-muted-foreground hover:bg-fill-hover",
						)}
					>
						seat log
					</button>
				}
			/>
			<div className="flex min-h-0 flex-1">
				<div className="relative min-w-0 flex-1 bg-background">
					{!hostReady ? (
						<Empty text="Waiting for the local host…" />
					) : state.isError ? (
						<Empty
							text={`The office could not start: ${state.error.message}`}
						/>
					) : !data ? (
						<Empty text="Opening the office…" />
					) : (
						<div className="absolute inset-0 p-6">
							<OfficeFloor
								state={data}
								selectedId={selectedId}
								onSelectTeammate={(id) => setSelectedId(id)}
								onSelectRoom={(id) => setRoomId(id)}
							/>
						</div>
					)}
					{showLog && data ? (
						<div className="absolute inset-x-6 bottom-4 max-h-48 overflow-y-auto rounded-md border border-border bg-card/95 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground backdrop-blur">
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
								names={names}
								onClose={() => setSelectedId(null)}
								onTogglePaused={(paused) =>
									setPaused.mutate({ id: selected.id, paused })
								}
							/>
						</div>
					) : null}
					{data && activeRoom ? (
						<>
							<div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
								{rooms.map((r) => (
									<button
										type="button"
										key={r.id}
										onClick={() => setRoomId(r.id)}
										className={cn(
											"rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
											r.id === activeRoom.id
												? "bg-fill-selected text-foreground"
												: "text-muted-foreground hover:bg-fill-hover",
										)}
									>
										#{r.name}
									</button>
								))}
							</div>
							<RoomFeed
								room={activeRoom}
								messages={data.messages}
								teammates={data.teammates}
								me={me}
								sending={say.isPending}
								onSend={(input) =>
									say.mutateAsync({ authorId: me?.id ?? "", ...input })
								}
							/>
						</>
					) : null}
				</aside>
			</div>
		</div>
	);
}

function Empty({ text }: { text: string }) {
	return (
		<div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
			{text}
		</div>
	);
}
