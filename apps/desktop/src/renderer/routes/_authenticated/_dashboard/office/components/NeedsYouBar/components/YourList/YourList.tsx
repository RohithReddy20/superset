import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuListTodo } from "react-icons/lu";
import { useCityTeam } from "../../../../city/hooks/useCityTeam";
import { type CityTodo, isOpenTodo, YOU } from "../../../../city/types";

/** The person's own list: what teammates asked of them and what they noted for themselves. */
export function YourList() {
	const { todos, setTodo, addTodo } = useCityTeam();
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const mine = todos.filter((t) => t.ownerId === YOU && isOpenTodo(t));

	const run = (action: Promise<unknown>) => {
		setError(null);
		action.catch((cause: unknown) =>
			setError(cause instanceof Error ? cause.message : String(cause)),
		);
	};
	const add = () => {
		const wanted = text.trim();
		if (!wanted) return;
		setText("");
		run(addTodo(wanted));
	};
	const next = (todo: CityTodo): CityTodo["state"] =>
		todo.state === "doing" ? "open" : "doing";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 shrink-0 gap-1.5 px-2 text-[12px]"
				>
					<LuListTodo className="size-3.5" />
					Your list
					{mine.length > 0 ? (
						<span className="rounded-full bg-muted px-1.5 text-[11px]">
							{mine.length}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-80 flex-col gap-2 p-3">
				{mine.length === 0 ? (
					<p className="text-[12px] text-muted-foreground">
						Nothing on your list.
					</p>
				) : (
					<ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
						{mine.map((todo) => (
							<li key={todo.id} className="flex flex-col gap-1 text-[12px]">
								<span className="break-words">
									{todo.text}
									{todo.askedByName ? (
										<span className="text-muted-foreground">
											{" "}
											· asked by {todo.askedByName}
										</span>
									) : null}
								</span>
								<div className="flex gap-1.5">
									<Button
										size="sm"
										variant={todo.state === "doing" ? "default" : "outline"}
										className="h-6 px-2 text-[11px]"
										onClick={() => run(setTodo(todo.id, next(todo)))}
									>
										{todo.state === "doing" ? "Doing" : "Start"}
									</Button>
									<Button
										size="sm"
										variant="outline"
										className="h-6 px-2 text-[11px]"
										onClick={() => run(setTodo(todo.id, "finished"))}
									>
										Finished
									</Button>
									<Button
										size="sm"
										variant="ghost"
										className="h-6 px-2 text-[11px]"
										onClick={() => run(setTodo(todo.id, "dropped"))}
									>
										Drop
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
				<div className="flex gap-1.5">
					<input
						value={text}
						onChange={(event) => setText(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") add();
						}}
						placeholder="Add something for yourself"
						aria-label="Add something for yourself"
						className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-[12px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
					/>
					<Button
						size="sm"
						className="h-7 px-2 text-[12px]"
						disabled={!text.trim()}
						onClick={add}
					>
						Add
					</Button>
				</div>
				{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
			</PopoverContent>
		</Popover>
	);
}
