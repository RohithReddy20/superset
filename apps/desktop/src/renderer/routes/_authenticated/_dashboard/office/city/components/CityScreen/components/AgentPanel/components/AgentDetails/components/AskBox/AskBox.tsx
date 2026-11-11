import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuListPlus } from "react-icons/lu";
import { useCityTeam } from "../../../../../../../../hooks/useCityTeam";
import type { CityAgent } from "../../../../../../../../types";

/** Asks the agent for something: it goes on the agent's own list, and its answer comes back to you. */
export function AskBox({ agent }: { agent: CityAgent }) {
	const { ask } = useCityTeam();
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [note, setNote] = useState<string | null>(null);

	const send = () => {
		const wanted = text.trim();
		if (!wanted || busy) return;
		setBusy(true);
		setNote(null);
		ask(`@${agent.handle}`, wanted)
			.then(({ todo, waiting }) => {
				setText("");
				setOpen(false);
				setNote(
					waiting.length > 0
						? `${todo.id} is on ${agent.name}'s list. It cannot be reached now and gets it when it is back.`
						: `${todo.id} is on ${agent.name}'s list.`,
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
					onClick={() => setOpen(true)}
				>
					<LuListPlus className="size-3.5" />
					Ask {agent.name} for something
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
				rows={3}
				placeholder={`What do you need from ${agent.name}? It goes on its list.`}
				className="resize-none rounded border border-border bg-background p-1.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
			/>
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
					onClick={send}
				>
					Ask
				</Button>
			</div>
			{note ? <p className="text-red-500">{note}</p> : null}
		</div>
	);
}
