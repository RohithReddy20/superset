import { formatRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { LongText } from "../../../../../../../../../components/LongText";
import { useCityTeam } from "../../../../../../../../hooks/useCityTeam";
import { type CityAgent, isOpenTodo } from "../../../../../../../../types";

const SHOWN_NOTES = 10;

/** What the agent carries on its own list, and what it wrote to you. */
export function ListBox({ agent }: { agent: CityAgent }) {
	const { todos, toYou } = useCityTeam();
	const own = todos
		.filter((t) => isOpenTodo(t) && t.ownerId === agent.terminalId)
		.sort((a, b) => Number(b.state === "doing") - Number(a.state === "doing"));
	const wrote = toYou
		.filter((n) => n.fromId === agent.terminalId)
		.slice(-SHOWN_NOTES)
		.reverse();

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 text-[12px]">
			<section className="flex flex-col gap-1.5">
				<h3 className="text-[11px] font-medium text-muted-foreground">
					On {agent.name}'s list
				</h3>
				{own.length === 0 ? (
					<p className="text-muted-foreground">
						Nothing open. Use "Ask for something" below to put an item on it.
					</p>
				) : (
					<ul className="flex flex-col gap-1.5">
						{own.map((todo) => (
							<li
								key={todo.id}
								className={cn(
									"flex items-baseline gap-2 rounded-md border px-2 py-1.5 transition-colors duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1",
									todo.state === "doing"
										? "border-amber-500/40 bg-amber-500/10"
										: "border-border",
								)}
							>
								<span
									className={cn(
										"shrink-0 font-mono text-[10px]",
										todo.state === "doing"
											? "text-amber-600 dark:text-amber-400"
											: "text-muted-foreground",
									)}
								>
									{todo.state === "doing" ? "doing" : todo.id}
								</span>
								<span className="min-w-0 flex-1 break-words">
									{todo.text}
									{todo.askedByName ? (
										<span className="text-muted-foreground">
											{" "}
											· asked by {todo.askedByName}
										</span>
									) : null}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>
			{wrote.length > 0 ? (
				<section className="flex flex-col gap-1.5">
					<h3 className="text-[11px] font-medium text-muted-foreground">
						{agent.name} wrote to you
					</h3>
					<ul className="flex flex-col gap-1.5">
						{wrote.map((note) => (
							<li
								key={note.id}
								className="rounded-md bg-muted/50 px-2 py-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
							>
								<span className="text-[10px] text-muted-foreground">
									{formatRelativeTime(note.at)}
								</span>
								<LongText text={note.text} />
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}
