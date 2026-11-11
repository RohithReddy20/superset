import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { LongText } from "../../../../../../../../../components/LongText";
import { useCityTeam } from "../../../../../../../../hooks/useCityTeam";
import {
	type CityAgent,
	type CityTodo,
	isOpenTodo,
	YOU,
} from "../../../../../../../../types";

const SHOWN_NOTES = 3;

/** What the agent carries on its own list, what it asked of you, and what it wrote to you. */
export function ListBox({ agent }: { agent: CityAgent }) {
	const { todos, setTodo, toYou, unread, markRead, waiting } = useCityTeam();
	const [error, setError] = useState<string | null>(null);
	const open = todos.filter(isOpenTodo);
	const own = open.filter((t) => t.ownerId === agent.terminalId);
	const forYou = open.filter(
		(t) => t.ownerId === YOU && t.askedById === agent.terminalId,
	);
	const wrote = toYou
		.filter((n) => n.fromId === agent.terminalId)
		.slice(-SHOWN_NOTES);
	const newest = unread.findLast((n) => n.fromId === agent.terminalId)?.id;
	// biome-ignore lint/correctness/useExhaustiveDependencies: markRead is a new function each render
	useEffect(() => {
		if (newest) void markRead(agent.terminalId).catch(() => {});
	}, [newest, agent.terminalId]);
	const held = waiting.filter((d) => d.toId === agent.terminalId);
	if (
		own.length === 0 &&
		forYou.length === 0 &&
		wrote.length === 0 &&
		held.length === 0
	)
		return null;

	const move = (todo: CityTodo, state: CityTodo["state"]) => {
		setError(null);
		setTodo(todo.id, state).catch((cause: unknown) =>
			setError(cause instanceof Error ? cause.message : String(cause)),
		);
	};

	return (
		<div className="flex flex-col gap-2 rounded-md border border-border p-2 text-[12px]">
			{own.length > 0 ? (
				<section className="flex flex-col gap-1">
					<h3 className="text-[11px] text-muted-foreground">
						On {agent.name}'s list
					</h3>
					<ul className="flex flex-col gap-1">
						{own.map((todo) => (
							<li key={todo.id} className="flex items-baseline gap-1.5">
								<span
									className={cn(
										"shrink-0 rounded px-1 font-mono text-[10px]",
										todo.state === "doing"
											? "bg-amber-500/15 text-amber-500"
											: "bg-muted text-muted-foreground",
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
				</section>
			) : null}
			{forYou.length > 0 ? (
				<section className="flex flex-col gap-1">
					<h3 className="text-[11px] text-muted-foreground">
						{agent.name} asked you
					</h3>
					<ul className="flex flex-col gap-1.5">
						{forYou.map((todo) => (
							<li key={todo.id} className="flex items-start gap-1.5">
								<span className="min-w-0 flex-1 break-words">{todo.text}</span>
								<Button
									size="sm"
									variant="outline"
									className="h-6 shrink-0 px-2 text-[11px]"
									onClick={() => move(todo, "finished")}
								>
									Finished
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="h-6 shrink-0 px-2 text-[11px]"
									onClick={() => move(todo, "dropped")}
								>
									Not mine
								</Button>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{wrote.length > 0 ? (
				<section className="flex flex-col gap-1">
					<h3 className="text-[11px] text-muted-foreground">
						{agent.name} wrote to you
					</h3>
					<ul className="flex flex-col gap-1.5">
						{wrote.map((note) => (
							<li key={note.id} className="rounded bg-muted/50 px-2 py-1">
								<LongText text={note.text} />
							</li>
						))}
					</ul>
				</section>
			) : null}
			{held.length > 0 ? (
				<p className="text-amber-500">
					{held.length === 1
						? "1 message waits"
						: `${held.length} messages wait`}{" "}
					to reach {agent.name}; it gets {held.length === 1 ? "it" : "them"}{" "}
					when it is back.
				</p>
			) : null}
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
		</div>
	);
}
