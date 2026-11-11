import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuGavel } from "react-icons/lu";
import { useCityTeam } from "../../../../../../../../hooks/useCityTeam";
import {
	type CityAgent,
	type CityPlace,
	YOU,
} from "../../../../../../../../types";

interface DecideBoxProps {
	place: CityPlace;
	people: CityAgent[];
	handleOf: ReadonlyMap<string, string>;
}

const FIELD =
	"min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Writes down what the room agreed, and puts on each one's list what they took. */
export function DecideBox({ place, people, handleOf }: DecideBoxProps) {
	const { decide } = useCityTeam();
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [took, setTook] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);
	const takers = [
		{ id: YOU, name: "You", to: "@me" },
		...people.flatMap((agent) => {
			const handle = handleOf.get(agent.terminalId) ?? agent.handle;
			return handle
				? [{ id: agent.terminalId, name: agent.name, to: `@${handle}` }]
				: [];
		}),
	];

	const save = () => {
		const decided = text.trim();
		if (!decided || busy) return;
		setBusy(true);
		setNote(null);
		decide(
			place,
			decided,
			takers.flatMap((taker) => {
				const item = took[taker.id]?.trim();
				return item ? [{ to: taker.to, text: item }] : [];
			}),
		)
			.then(({ todos, waiting }) => {
				setText("");
				setTook({});
				setOpen(false);
				setNote(
					[
						todos.length > 0
							? `${todos.map((t) => t.id).join(", ")} put on lists.`
							: "Written down.",
						waiting.length > 0
							? `${waiting.join(", ")} cannot be reached now and will get it when back.`
							: "",
					]
						.filter(Boolean)
						.join(" "),
				);
			})
			.catch((cause: unknown) =>
				setNote(cause instanceof Error ? cause.message : String(cause)),
			)
			.finally(() => setBusy(false));
	};

	if (!open)
		return (
			<div className="flex items-center gap-2 text-[12px]">
				<Button
					variant="outline"
					size="sm"
					className="gap-1.5 text-xs"
					disabled={people.length === 0}
					onClick={() => setOpen(true)}
				>
					<LuGavel className="size-3.5" />
					Write down what we decided
				</Button>
				{note ? <span className="text-muted-foreground">{note}</span> : null}
			</div>
		);

	return (
		<div className="flex flex-col gap-1.5 rounded-md border border-border p-2 text-[12px]">
			<textarea
				// biome-ignore lint/a11y/noAutofocus: the box opens because the person asked to type here
				autoFocus
				value={text}
				onChange={(event) => setText(event.target.value)}
				rows={2}
				placeholder="What did you all decide?"
				className={`${FIELD} resize-none`}
			/>
			<p className="text-[11px] text-muted-foreground">
				Who took what (leave empty for none). Each goes on that one's own list.
			</p>
			{takers.map((taker) => (
				<label key={taker.id} className="flex items-center gap-1.5">
					<span className="w-20 shrink-0 truncate">{taker.name}</span>
					<input
						value={took[taker.id] ?? ""}
						onChange={(event) =>
							setTook((all) => ({ ...all, [taker.id]: event.target.value }))
						}
						onKeyDown={(event) => {
							if (event.key === "Enter") save();
						}}
						className={FIELD}
					/>
				</label>
			))}
			<div className="flex items-center justify-end gap-1.5">
				<Button
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-[11px]"
					onClick={() => setOpen(false)}
				>
					Cancel
				</Button>
				<Button
					size="sm"
					className="h-6 px-2 text-[11px]"
					disabled={!text.trim() || busy}
					onClick={save}
				>
					Write it down
				</Button>
			</div>
			{note ? <p className="text-red-500">{note}</p> : null}
		</div>
	);
}
