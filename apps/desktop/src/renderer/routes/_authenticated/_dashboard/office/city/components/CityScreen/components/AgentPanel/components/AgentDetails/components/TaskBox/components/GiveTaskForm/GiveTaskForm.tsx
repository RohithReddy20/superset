import { Button } from "@superset/ui/button";
import { useState } from "react";

const FIELD =
	"w-full rounded-md border border-input bg-background px-2 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

type Checker = "claude" | "codex" | "none";

interface GiveTaskFormProps {
	agentName: string;
	defaultCheckCommand: string;
	onGive: (input: {
		title: string;
		brief: string;
		checkCommand?: string;
		checker?: "claude" | "codex";
	}) => Promise<unknown>;
	onCancel: () => void;
}

/** What to do, what done means, and how it is checked before it reaches you. */
export function GiveTaskForm({
	agentName,
	defaultCheckCommand,
	onGive,
	onCancel,
}: GiveTaskFormProps) {
	const [title, setTitle] = useState("");
	const [brief, setBrief] = useState("");
	const [checkCommand, setCheckCommand] = useState(defaultCheckCommand);
	const [checker, setChecker] = useState<Checker>("claude");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const give = async () => {
		if (!title.trim() || sending) return;
		setSending(true);
		setError(null);
		try {
			await onGive({
				title: title.trim(),
				brief: brief.trim(),
				...(checkCommand.trim() ? { checkCommand: checkCommand.trim() } : {}),
				...(checker !== "none" ? { checker } : {}),
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
			setSending(false);
		}
	};

	return (
		<form
			className="flex flex-col gap-2 rounded-md border border-border p-2"
			onSubmit={(event) => {
				event.preventDefault();
				void give();
			}}
		>
			<label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
				Task for {agentName}
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Add a health check endpoint"
					className={FIELD}
				/>
			</label>
			<label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
				What done looks like
				<textarea
					value={brief}
					onChange={(e) => setBrief(e.target.value)}
					rows={3}
					placeholder="GET /health returns 200 with {ok: true}, with a test for it."
					className={`${FIELD} resize-none`}
				/>
			</label>
			<label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
				Check command (optional)
				<input
					value={checkCommand}
					onChange={(e) => setCheckCommand(e.target.value)}
					placeholder="bun test"
					className={`${FIELD} font-mono`}
				/>
			</label>
			<label className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
				Second agent checks it
				<select
					value={checker}
					onChange={(e) => setChecker(e.target.value as Checker)}
					className="rounded-md border border-input bg-background px-1.5 py-1 text-[12px] text-foreground"
				>
					<option value="claude">Claude</option>
					<option value="codex">Codex</option>
					<option value="none">Nobody</option>
				</select>
			</label>
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
			<div className="flex justify-end gap-1.5">
				<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={!title.trim() || sending}>
					Give task
				</Button>
			</div>
		</form>
	);
}
