import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuMessageCircleQuestion } from "react-icons/lu";
import { LongText } from "../../../../../../../../../components/LongText";
import { useCityTeam } from "../../../../../../../../hooks/useCityTeam";
import {
	type CityAgent,
	type CityTodo,
	isOpenTodo,
	YOU,
} from "../../../../../../../../types";

/** What the agent asked of you and waits on: answer in place, or say it is finished or not yours. */
export function AskedYou({ agent }: { agent: CityAgent }) {
	const { todos, setTodo, say } = useCityTeam();
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const asked = todos.filter(
		(t) =>
			isOpenTodo(t) && t.ownerId === YOU && t.askedById === agent.terminalId,
	);
	if (asked.length === 0) return null;

	const fail = (cause: unknown) =>
		setError(cause instanceof Error ? cause.message : String(cause));
	const move = (todo: CityTodo, state: CityTodo["state"]) => {
		setError(null);
		setTodo(todo.id, state).catch(fail);
	};
	const answer = (todo: CityTodo) => {
		const text = answers[todo.id]?.trim();
		if (!text) return;
		setError(null);
		say(`@${agent.handle}`, text)
			.then(() => setTodo(todo.id, "finished"))
			.then(() => setAnswers(({ [todo.id]: _sent, ...rest }) => rest))
			.catch(fail);
	};

	return (
		<section
			aria-label={`${agent.name} asks you`}
			className="flex flex-col gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 p-2.5 text-[12px]"
		>
			{asked.map((todo) => (
				<div key={todo.id} className="flex flex-col gap-1.5">
					<p className="flex items-start gap-1.5">
						<LuMessageCircleQuestion className="mt-0.5 size-3.5 shrink-0 text-orange-500" />
						<span className="min-w-0 flex-1">
							<span className="font-medium">{agent.name} asks you</span>
							<LongText text={todo.text} />
						</span>
					</p>
					<div className="flex flex-wrap items-center gap-1.5">
						<input
							value={answers[todo.id] ?? ""}
							onChange={(event) =>
								setAnswers((all) => ({ ...all, [todo.id]: event.target.value }))
							}
							onKeyDown={(event) => {
								if (event.key === "Enter") answer(todo);
							}}
							placeholder={`Your answer to ${agent.name}`}
							aria-label={`Your answer to ${agent.name}`}
							className="h-7 min-w-32 flex-1 rounded-md border border-input bg-background px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
						/>
						<Button
							size="sm"
							className="h-7 shrink-0 px-2.5 text-[12px]"
							disabled={!answers[todo.id]?.trim()}
							onClick={() => answer(todo)}
						>
							Answer
						</Button>
						<Button
							size="sm"
							variant="ghost"
							title="Close the item without an answer"
							className="h-7 shrink-0 px-2 text-[12px]"
							onClick={() => move(todo, "finished")}
						>
							Finished
						</Button>
						<Button
							size="sm"
							variant="ghost"
							title="Take it off your list"
							className="h-7 shrink-0 px-2 text-[12px] text-muted-foreground"
							onClick={() => move(todo, "dropped")}
						>
							Not mine
						</Button>
					</div>
				</div>
			))}
			{error ? (
				<p role="alert" className="text-[11px] text-red-500">
					{error}
				</p>
			) : null}
		</section>
	);
}
