import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuLoaderCircle, LuRotateCcw, LuUnplug } from "react-icons/lu";
import { useCityActions } from "../../../../../../../../hooks/useCityActions";
import type { CityAgent } from "../../../../../../../../types";

interface LostNoticeProps {
	agent: Pick<CityAgent, "terminalId" | "name" | "lost">;
	/** Opens the agent in the terminal it continues in. */
	onReconnected: (terminalId: string) => void;
	onRemoved: () => void;
}

/** Says an agent's terminal stopped, and offers to continue its conversation in a new one. */
export function LostNotice({
	agent,
	onReconnected,
	onRemoved,
}: LostNoticeProps) {
	const actions = useCityActions();
	const [busy, setBusy] = useState<"reconnect" | "remove" | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const lost = agent.lost;
	if (!lost) return null;

	const run = async (kind: "reconnect" | "remove") => {
		setBusy(kind);
		setError(null);
		try {
			if (kind === "reconnect")
				onReconnected((await actions.reconnect(agent.terminalId)).terminalId);
			else {
				await actions.remove(agent.terminalId);
				onRemoved();
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(null);
			setConfirming(false);
		}
	};

	if (lost.reconnecting)
		return (
			<div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-[12px] text-muted-foreground">
				<LuLoaderCircle className="size-3.5 shrink-0 motion-safe:animate-spin" />
				Reconnecting. {agent.name} continues its conversation in a new terminal.
			</div>
		);

	return (
		<div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-[12px]">
			<div className="flex items-center gap-1.5 font-medium">
				<LuUnplug className="size-3.5 text-muted-foreground" />
				Disconnected
			</div>
			<p className="text-muted-foreground">
				{lost.resumable
					? `Its terminal stopped, maybe because the app restarted. Reconnect continues the same conversation in a new terminal. ${agent.name} keeps its name, seat and task.`
					: "Its terminal stopped, and its conversation can't continue in a new one. Remove it, or start a new agent in its workspace."}
			</p>
			{confirming ? (
				<div className="flex flex-wrap items-center gap-1.5">
					<span>Remove {agent.name} for good? Any open task is cancelled.</span>
					<Button
						variant="destructive"
						size="sm"
						className="h-7 text-[12px]"
						disabled={busy !== null}
						onClick={() => void run("remove")}
					>
						Remove
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-[12px]"
						onClick={() => setConfirming(false)}
					>
						Keep
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap gap-1.5">
					{lost.resumable ? (
						<Button
							size="sm"
							className="h-7 gap-1.5 text-[12px]"
							disabled={busy !== null}
							onClick={() => void run("reconnect")}
						>
							{busy === "reconnect" ? (
								<LuLoaderCircle className="size-3.5 motion-safe:animate-spin" />
							) : (
								<LuRotateCcw className="size-3.5" />
							)}
							Reconnect
						</Button>
					) : null}
					<Button
						variant="outline"
						size="sm"
						className="h-7 text-[12px]"
						disabled={busy !== null}
						onClick={() => setConfirming(true)}
					>
						Remove
					</Button>
				</div>
			)}
			{error ? <p className="text-red-500">{error}</p> : null}
		</div>
	);
}
