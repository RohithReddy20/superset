import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuCornerDownRight, LuX } from "react-icons/lu";
import type { Message, Room, Teammate } from "../../types";
import { EngineMark } from "../EngineMark";
import { LongText } from "../LongText";
import { ENGINE_COLORS } from "../OfficeFloor/constants";

interface RoomFeedProps {
	room: Room;
	messages: Message[];
	teammates: Teammate[];
	me: Teammate | null;
	sending: boolean;
	/** A thread to open, e.g. a task's; changes re-open it. */
	openThreadId?: string | null;
	onSend: (input: {
		roomId: string;
		threadId: string | null;
		text: string;
	}) => Promise<unknown>;
}

const timeOf = (ts: number) =>
	new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function RoomFeed({
	room,
	messages,
	teammates,
	me,
	sending,
	openThreadId = null,
	onSend,
}: RoomFeedProps) {
	const [threadId, setThreadId] = useState<string | null>(openThreadId);
	useEffect(() => {
		if (openThreadId) setThreadId(openThreadId);
	}, [openThreadId]);
	const [text, setText] = useState("");
	const byId = new Map(teammates.map((t) => [t.id, t]));
	const roots = messages.filter(
		(m) => m.roomId === room.id && m.threadId === null,
	);
	const repliesOf = (id: string) => messages.filter((m) => m.threadId === id);
	const scrollRef = useRef<HTMLDivElement>(null);
	const lastCount = useRef(0);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const count = messages.filter((m) => m.roomId === room.id).length;
		if (count !== lastCount.current) {
			lastCount.current = count;
			el.scrollTop = el.scrollHeight;
		}
	}, [messages, room.id]);

	const submit = async () => {
		const body = text.trim();
		if (!body || !me) return;
		await onSend({ roomId: room.id, threadId, text: body });
		setText("");
	};

	const threadRoot = threadId ? messages.find((m) => m.id === threadId) : null;

	const renderMessage = (m: Message, inThread: boolean) => {
		const author = byId.get(m.authorId);
		const color = ENGINE_COLORS[author?.engine ?? "human"];
		const replies = inThread ? [] : repliesOf(m.id);
		return (
			<div key={m.id} className="flex gap-2.5">
				<span
					className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]"
					style={{ borderColor: color, color }}
				>
					{(author?.name ?? m.authorId).slice(0, 2).toUpperCase()}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline gap-1.5">
						<EngineMark
							engine={author?.engine}
							className="size-3 self-center"
						/>
						<span className="text-[13px] font-medium text-foreground">
							{author?.name ?? m.authorId}
						</span>
						{m.kind === "system" ? (
							<span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
								status
							</span>
						) : null}
						<span className="text-[11px] text-muted-foreground">
							{timeOf(m.ts)}
							{m.depth > 0 ? ` · hop ${m.depth}` : ""}
						</span>
					</div>
					<LongText
						text={m.text}
						className={cn(
							"text-[13px] leading-snug",
							m.kind === "system" ? "text-muted-foreground" : "text-foreground",
						)}
					/>
					{!inThread ? (
						<button
							type="button"
							onClick={() => setThreadId(m.id)}
							className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
						>
							<LuCornerDownRight className="size-3" />
							{replies.length > 0
								? `${replies.length} in thread`
								: "reply in thread"}
						</button>
					) : null}
					{replies.length > 0 ? (
						<div className="mt-2 flex flex-col gap-2 border-l border-border pl-3">
							{replies.map((r) => renderMessage(r, true))}
						</div>
					) : null}
				</div>
			</div>
		);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div
				ref={scrollRef}
				className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
			>
				{roots.length === 0 ? (
					<p className="text-[12px] text-muted-foreground">
						Nothing here yet. Mention a teammate with @name to give them
						something to do.
					</p>
				) : (
					roots.map((m) => renderMessage(m, false))
				)}
			</div>
			<div className="border-t border-border p-2">
				{threadRoot ? (
					<div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<LuCornerDownRight className="size-3" />
						<span className="truncate">
							Replying to “{threadRoot.text.slice(0, 60)}”
						</span>
						<button
							type="button"
							onClick={() => setThreadId(null)}
							className="ml-auto hover:text-foreground"
							aria-label="Cancel reply"
						>
							<LuX className="size-3" />
						</button>
					</div>
				) : null}
				<Textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void submit();
						}
					}}
					placeholder={
						me
							? `Write as ${me.name} in #${room.name}… @scout to mention`
							: "No person is seated in this office"
					}
					disabled={!me || sending}
					rows={2}
					className="min-h-0 resize-none text-[13px]"
				/>
				<div className="mt-1.5 flex justify-end">
					<Button
						size="sm"
						onClick={() => void submit()}
						disabled={!me || sending || !text.trim()}
					>
						Send
					</Button>
				</div>
			</div>
		</div>
	);
}
