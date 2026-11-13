import { formatCompactRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";
import { LongText } from "../../../../../components/LongText";
import { TICK_MS, useNow } from "../../../../../hooks/useNow";
import { useCityTeam } from "../../../../hooks/useCityTeam";
import {
	type CityAgent,
	type CityNote,
	type CityPlace,
	type CityTodo,
	YOU,
} from "../../../../types";
import { roomTalk } from "../../../../utils/roomTalk";
import { AgentFace } from "../AgentFace";

interface RoomFeedProps {
	place: CityPlace;
	people: CityAgent[];
	onSelectAgent: (terminalId: string) => void;
	className?: string;
}

/** What was said in a room, oldest first, kept at the newest line. */
export function RoomFeed({
	place,
	people,
	onSelectAgent,
	className,
}: RoomFeedProps) {
	const { notes, todos } = useCityTeam();
	const now = useNow(TICK_MS);
	const scrollRef = useRef<HTMLDivElement>(null);
	const nameOf = new Map(people.map((p) => [p.terminalId, p.name]));
	const messages = roomTalk(notes, place, new Set(nameOf.keys()));
	const said = messages.length;
	const toWhom = (ids: string[]) =>
		ids
			.map((id) => (id === YOU ? "you" : (nameOf.get(id) ?? "someone")))
			.join(", ");

	useEffect(() => {
		const node = scrollRef.current;
		if (node && said > 0) node.scrollTop = node.scrollHeight;
	}, [said]);

	return (
		<div
			ref={scrollRef}
			className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3"
		>
			<div className={cn("flex flex-col gap-3", className)}>
				{messages.length === 0 ? (
					<p className="text-[12px] text-muted-foreground">
						Nothing said in this room yet. What you and the agents sitting here
						write to the room or to each other, and what you decide, shows here.
					</p>
				) : (
					messages.map((m) => {
						const mine = m.fromId === YOU;
						const here = nameOf.has(m.fromId);
						return (
							<div
								key={m.id}
								className={cn("flex gap-2", mine && "flex-row-reverse")}
							>
								{mine ? null : (
									<AgentFace name={m.fromName} className="mt-4 size-6" />
								)}
								<div
									className={cn(
										"flex min-w-0 flex-1 flex-col gap-0.5",
										mine && "items-end",
									)}
								>
									<span className="text-[10px] text-muted-foreground">
										{mine ? (
											"You"
										) : here ? (
											<button
												type="button"
												onClick={() => onSelectAgent(m.fromId)}
												className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												{m.fromName}
											</button>
										) : (
											m.fromName
										)}
										{m.decision
											? " wrote down a decision"
											: m.room
												? " → everyone here"
												: `${m.expectsReply ? " asked " : " → "}${toWhom(m.toIds)}`}
										{" · "}
										{formatCompactRelativeTime(m.at, Math.max(now, m.at))}
									</span>
									<LongText
										text={withTaken(m, todos)}
										className={cn(
											"w-fit max-w-[92%] rounded-lg px-2.5 py-1.5 text-[12px] leading-snug",
											m.decision
												? "border border-amber-500/40 bg-amber-500/10 text-foreground"
												: mine
													? "bg-foreground text-background [&_button]:text-background/70"
													: "border border-border bg-background text-foreground",
										)}
									/>
								</div>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}

function withTaken(note: CityNote, todos: CityTodo[]): string {
	const taken = (note.decision?.todoIds ?? []).flatMap((id) => {
		const todo = todos.find((t) => t.id === id);
		return todo
			? [
					`${todo.ownerId === YOU ? "You" : todo.ownerName} took ${todo.id}: ${todo.text}`,
				]
			: [];
	});
	return taken.length > 0 ? `${note.text}\n\n${taken.join("\n")}` : note.text;
}
