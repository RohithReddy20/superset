import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuPencil } from "react-icons/lu";
import { useCityActions } from "../../../../../../hooks/useCityActions";
import type { CityAgent } from "../../../../../../types";

const MAX_NAME_CHARS = 24;

/** An agent's name, with a pencil to rename it; Enter saves, Escape gives up. */
export function AgentName({ agent }: { agent: CityAgent }) {
	const actions = useCityActions();
	const [draft, setDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const save = async () => {
		if (draft === null || saving) return;
		const name = draft.trim();
		if (!name || name === agent.name) {
			setDraft(null);
			return;
		}
		setSaving(true);
		setError(null);
		try {
			await actions.rename(agent.terminalId, name);
			setDraft(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	};

	if (draft === null)
		return (
			<div className="flex min-w-0 items-center gap-1">
				<span className="truncate text-sm font-medium">{agent.name}</span>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Rename"
					title="Rename"
					className="size-6 text-muted-foreground"
					disabled={!agent.handle}
					onClick={() => {
						setError(null);
						setDraft(agent.name);
					}}
				>
					<LuPencil className="size-3" />
				</Button>
			</div>
		);
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<input
				// biome-ignore lint/a11y/noAutofocus: the field opens on the user's click to rename
				autoFocus
				value={draft}
				maxLength={MAX_NAME_CHARS}
				disabled={saving}
				aria-label="New name"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => void save()}
				onKeyDown={(event) => {
					if (event.key === "Enter") void save();
					if (event.key === "Escape") {
						setError(null);
						setDraft(null);
					}
				}}
				className="h-7 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			/>
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
		</div>
	);
}
