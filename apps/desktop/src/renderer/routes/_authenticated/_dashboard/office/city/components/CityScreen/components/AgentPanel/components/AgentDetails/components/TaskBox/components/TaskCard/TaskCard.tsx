import { formatCompactRelativeTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuCircleCheck,
	LuCircleX,
	LuExternalLink,
	LuGitPullRequest,
} from "react-icons/lu";
import { openPullRequestInBrowser } from "renderer/lib/github/openPullRequestInBrowser";
import { LongText } from "../../../../../../../../../../../components/LongText";
import type { CityTask } from "../../../../../../../../../../types";

interface TaskCardProps {
	task: CityTask;
	/** Its agent's terminal stopped, so work in progress waits until it is reconnected. */
	paused?: boolean;
	onAskForPullRequest: () => Promise<unknown>;
	onClose: () => Promise<unknown>;
	onCancel: () => Promise<unknown>;
	onSendBack: (note: string) => Promise<unknown>;
}

function statusText(task: CityTask): string {
	switch (task.status) {
		case "working":
			return task.round > 1
				? `Working on it again (round ${task.round} of ${task.maxRounds})`
				: "Working on it";
		case "checking":
			return `Running ${task.checkCommand ?? "its check"}`;
		case "reviewing":
			return `${task.checkerName ?? "A second agent"} is checking it`;
		case "ready":
			return "Checked, ready for you";
		case "pr":
			return "Opening a pull request";
		case "blocked":
			return "Blocked";
		case "done":
			return task.prUrl ? "Done, pull request opened" : "Done";
		case "cancelled":
			return "Cancelled";
	}
}

const TONE: Partial<Record<CityTask["status"], string>> = {
	ready: "border-green-500/40 bg-green-500/10",
	blocked: "border-red-500/40 bg-red-500/10",
};

/** One task's progress, its checks, and what you can do with it now. */
export function TaskCard({
	task,
	paused = false,
	onAskForPullRequest,
	onClose,
	onCancel,
	onSendBack,
}: TaskCardProps) {
	const [note, setNote] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const act = async (action: () => Promise<unknown>) => {
		setPending(true);
		setError(null);
		try {
			await action();
			setNote(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPending(false);
		}
	};
	const open = task.status !== "done" && task.status !== "cancelled";
	const waitingForYou = task.status === "ready" || task.status === "blocked";
	const canClose = waitingForYou || task.status === "pr";

	return (
		<section
			aria-label={`Task ${task.id}`}
			className={cn(
				"flex flex-col gap-1.5 rounded-md border border-border p-2 text-[12px]",
				TONE[task.status],
			)}
		>
			<div className="flex items-baseline gap-1.5">
				<span className="font-mono text-[11px] text-muted-foreground">
					{task.id}
				</span>
				<span className="min-w-0 flex-1 font-medium">{task.title}</span>
			</div>
			<p className="text-muted-foreground">
				{paused && (task.status === "working" || task.status === "pr")
					? `Paused: ${task.agentName}'s terminal stopped. Reconnect it and it carries on.`
					: statusText(task)}
			</p>
			{task.report ? (
				<p>
					<span className="text-muted-foreground">It says: </span>
					{task.report}
				</p>
			) : null}
			{task.check ? (
				<details>
					<summary className="flex cursor-pointer items-center gap-1">
						{task.check.ok ? (
							<LuCircleCheck className="size-3.5 text-green-500" />
						) : (
							<LuCircleX className="size-3.5 text-red-500" />
						)}
						<code className="text-[11px]">{task.check.command}</code>
						{task.check.ok ? " passed" : " failed"}
					</summary>
					<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 text-[11px]">
						{task.check.output.trim() || "(no output)"}
					</pre>
				</details>
			) : null}
			{task.verdict ? (
				<div className="flex flex-col gap-0.5">
					<span className="flex items-center gap-1 text-muted-foreground">
						{task.verdict.ok ? (
							<LuCircleCheck className="size-3.5 text-green-500" />
						) : (
							<LuCircleX className="size-3.5 text-red-500" />
						)}
						{task.checkerName ?? "The checker"} said
					</span>
					<LongText
						text={task.verdict.text}
						className="rounded bg-background/60 p-1.5"
					/>
				</div>
			) : null}
			{task.status === "ready" && task.prError ? (
				<p className="text-red-500">
					Couldn't open a pull request: {task.prError}
				</p>
			) : null}
			{task.status === "blocked" && task.blockedReason ? (
				<p className="text-red-500">{task.blockedReason}</p>
			) : null}
			{task.prUrl ? (
				<Button
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 self-start text-[12px]"
					onClick={() => task.prUrl && openPullRequestInBrowser(task.prUrl)}
				>
					<LuExternalLink className="size-3.5" />
					Open the pull request
				</Button>
			) : null}
			<details>
				<summary className="cursor-pointer text-[11px] text-muted-foreground">
					History ({task.events.length})
				</summary>
				<ol className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
					{task.events.map((event) => (
						<li key={`${event.at}-${event.text}`}>
							{formatCompactRelativeTime(event.at)} · {event.text}
						</li>
					))}
				</ol>
			</details>
			{note !== null ? (
				<div className="flex flex-col gap-1">
					<textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						rows={2}
						placeholder="What to change"
						className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					/>
					<div className="flex justify-end gap-1.5">
						<Button variant="ghost" size="sm" onClick={() => setNote(null)}>
							Cancel
						</Button>
						<Button
							size="sm"
							disabled={pending}
							onClick={() => void act(() => onSendBack(note))}
						>
							Send back
						</Button>
					</div>
				</div>
			) : open ? (
				<div className="flex flex-wrap gap-1.5">
					{task.status === "ready" ? (
						<Button
							size="sm"
							className="h-7 gap-1.5 text-[12px]"
							disabled={pending}
							onClick={() => void act(onAskForPullRequest)}
						>
							<LuGitPullRequest className="size-3.5" />
							Ask for a pull request
						</Button>
					) : null}
					{canClose ? (
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-[12px]"
							disabled={pending}
							onClick={() => void act(onClose)}
						>
							Close
						</Button>
					) : null}
					{waitingForYou ? (
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-[12px]"
							disabled={pending}
							onClick={() => setNote("")}
						>
							Send back…
						</Button>
					) : canClose ? null : (
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-[12px] text-muted-foreground"
							disabled={pending}
							onClick={() => void act(onCancel)}
						>
							Cancel task
						</Button>
					)}
				</div>
			) : null}
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
		</section>
	);
}
