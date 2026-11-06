import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuExternalLink, LuSend, LuX } from "react-icons/lu";
import type { Message, Room, Teammate } from "../../../../types";
import type { GroupThread } from "../../../../utils/groupThreads";
import { EngineMark } from "../../../EngineMark";

interface GroupChatProps {
	group: Teammate[];
	everyone: Teammate[];
	rooms: Room[];
	messages: Message[];
	threads: GroupThread[];
	faces: Map<string, string>;
	onSend: (text: string) => Promise<void>;
	onOpenThread: (roomId: string, threadId: string) => void;
	onClose: () => void;
}

const timeOf = (ts: number) =>
	new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** A small chat with the picked teammates: their thread in each room they sit in. */
export function GroupChat({
	group,
	everyone,
	rooms,
	messages,
	threads,
	faces,
	onSend,
	onOpenThread,
	onClose,
}: GroupChatProps) {
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const roots = new Set(threads.flatMap((t) => (t.rootId ? [t.rootId] : [])));
	const shown = messages
		.filter((m) => roots.has(m.threadId ?? m.id))
		.sort((a, b) => a.ts - b.ts);
	const byId = new Map(everyone.map((t) => [t.id, t]));
	const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;
	const where =
		threads.length === 1
			? `in ${roomName(threads[0]?.roomId ?? "")}`
			: `in ${threads.length} rooms`;
	const names =
		group.length <= 3
			? group.map((t) => t.name).join(", ")
			: `${group.length} teammates`;
	const working = group.filter(
		(t) => t.presence === "focused" || t.presence === "in-meeting",
	);
	const firstThread = threads.find((t) => t.rootId);

	const shownCount = useRef(0);
	useEffect(() => {
		if (shown.length === shownCount.current) return;
		shownCount.current = shown.length;
		listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
	});

	useEffect(() => {
		inputRef.current?.focus({ preventScroll: true });
	}, []);

	const send = async () => {
		const message = text.trim();
		if (!message || sending) return;
		setSending(true);
		setError(null);
		try {
			await onSend(message);
			setText("");
		} catch (failure) {
			setError((failure as Error).message);
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="absolute bottom-3 left-3 flex max-h-[min(420px,calc(100%-24px))] w-[min(360px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-border bg-popover/95 shadow-lg backdrop-blur">
			<div className="flex items-center gap-2 border-b border-border px-2.5 py-2 text-[12px]">
				<div className="flex shrink-0 -space-x-1.5">
					{group.slice(0, 5).map((t) => (
						<img
							key={t.id}
							src={faces.get(t.id)}
							alt=""
							className="size-5 rounded-full border border-popover bg-muted object-cover"
							draggable={false}
						/>
					))}
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate font-medium text-foreground">{names}</div>
					<div className="truncate text-[11px] text-muted-foreground">
						{where} · drag them onto a room to move them
					</div>
				</div>
				{firstThread?.rootId ? (
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Open this conversation in the room"
						title="Open in the room"
						onClick={() =>
							onOpenThread(firstThread.roomId, firstThread.rootId as string)
						}
					>
						<LuExternalLink />
					</Button>
				) : null}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Close the group chat"
					title="Close (Esc)"
					onClick={onClose}
				>
					<LuX />
				</Button>
			</div>
			<div
				ref={listRef}
				className="flex min-h-[72px] flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-2"
			>
				{shown.length === 0 ? (
					<p className="m-auto max-w-[260px] text-center text-[12px] text-muted-foreground">
						{group.length === 1
							? `Say something to ${group[0]?.name}.`
							: `Say something to all ${group.length}. Each of them gets it, and their answers show up here.`}
					</p>
				) : (
					shown.map((m) => {
						const author = byId.get(m.authorId);
						const mine = author?.kind === "human";
						return (
							<div
								key={m.id}
								className={cn("flex flex-col", mine && "items-end")}
							>
								<div className="flex items-center gap-1 text-[11px] text-muted-foreground">
									{mine ? null : (
										<EngineMark engine={author?.engine} className="size-3" />
									)}
									<span className="font-medium text-foreground">
										{mine ? "You" : (author?.name ?? m.authorId)}
									</span>
									<span className="font-mono text-[10px]">{timeOf(m.ts)}</span>
									{threads.length > 1 ? (
										<span>· {roomName(m.roomId)}</span>
									) : null}
								</div>
								<p
									className={cn(
										"max-w-[92%] whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-[13px] leading-snug",
										mine
											? "bg-primary text-primary-foreground"
											: "bg-muted text-foreground",
										m.kind === "system" &&
											"bg-transparent px-0 italic text-muted-foreground",
									)}
								>
									{m.text}
								</p>
							</div>
						);
					})
				)}
				{working.map((t) => (
					<div
						key={t.id}
						className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
					>
						<span className="size-1.5 animate-pulse rounded-full bg-[#5ec8ff]" />
						<span className="truncate">
							{t.name} is working{t.line ? `: ${t.line}` : "…"}
						</span>
					</div>
				))}
			</div>
			<form
				className="flex items-center gap-1.5 border-t border-border p-2"
				onSubmit={(event) => {
					event.preventDefault();
					void send();
				}}
			>
				<input
					ref={inputRef}
					value={text}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") onClose();
					}}
					placeholder={
						group.length === 1
							? `Message ${group[0]?.name}…`
							: `Message all ${group.length}…`
					}
					aria-label="Message the picked teammates"
					className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
				/>
				<Button
					type="submit"
					size="icon-sm"
					aria-label="Send"
					disabled={!text.trim() || sending}
				>
					<LuSend />
				</Button>
			</form>
			{error ? (
				<div className="px-2.5 pb-2 text-[12px] text-destructive">{error}</div>
			) : null}
		</div>
	);
}
