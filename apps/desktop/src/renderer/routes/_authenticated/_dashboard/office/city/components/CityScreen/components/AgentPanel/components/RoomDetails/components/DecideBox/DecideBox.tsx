import { Button } from "@superset/ui/button";
import { useState } from "react";
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
	/** Called once it is written down, with what to tell the person. */
	onDone: (receipt: string) => void;
}

const FIELD =
	"min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/** Writes down what the room agreed, and puts on each one's list what they took. */
export function DecideBox({ place, people, handleOf, onDone }: DecideBoxProps) {
	const { decide } = useCityTeam();
	const [text, setText] = useState("");
	const [took, setTook] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
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
		setError(null);
		decide(
			place,
			decided,
			takers.flatMap((taker) => {
				const item = took[taker.id]?.trim();
				return item ? [{ to: taker.to, text: item }] : [];
			}),
		)
			.then(({ todos, waiting }) =>
				onDone(
					[
						todos.length > 0
							? `Written down. ${todos.map((t) => t.id).join(", ")} put on lists.`
							: "Written down.",
						waiting.length > 0
							? `${waiting.join(", ")} cannot be reached now and will get it when back.`
							: "",
					]
						.filter(Boolean)
						.join(" "),
				),
			)
			.catch((cause: unknown) =>
				setError(cause instanceof Error ? cause.message : String(cause)),
			)
			.finally(() => setBusy(false));
	};

	return (
		<div className="flex flex-col gap-1.5 text-[12px]">
			<textarea
				// biome-ignore lint/a11y/noAutofocus: the form opens because the person chose to write a decision
				autoFocus
				value={text}
				onChange={(event) => setText(event.target.value)}
				rows={2}
				placeholder="What did you all decide?"
				aria-label="What was decided"
				className={`${FIELD} resize-none text-[13px]`}
			/>
			<p className="text-[11px] text-muted-foreground">
				Who took what. Each goes on that one's own list; leave empty for none.
			</p>
			<div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
				{takers.map((taker) => (
					<label key={taker.id} className="flex items-center gap-1.5">
						<span className="w-20 shrink-0 truncate" title={taker.name}>
							{taker.name}
						</span>
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
			</div>
			<div className="flex items-center gap-2">
				{error ? (
					<p role="alert" className="min-w-0 flex-1 text-[11px] text-red-500">
						{error}
					</p>
				) : (
					<span className="flex-1" />
				)}
				<Button
					size="sm"
					className="h-7 px-2.5 text-[12px]"
					disabled={!text.trim() || busy}
					onClick={save}
				>
					Write it down
				</Button>
			</div>
		</div>
	);
}
