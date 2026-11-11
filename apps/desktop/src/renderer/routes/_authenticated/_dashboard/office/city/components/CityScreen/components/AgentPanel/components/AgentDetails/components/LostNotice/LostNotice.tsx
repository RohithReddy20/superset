import { Button } from "@superset/ui/button";
import { useEffect, useRef, useState } from "react";
import { LuLoaderCircle, LuRotateCcw, LuUnplug } from "react-icons/lu";
import { useCityActions } from "../../../../../../../../hooks/useCityActions";
import type { CityAgent } from "../../../../../../../../types";

interface LostNoticeProps {
	agent: Pick<CityAgent, "terminalId" | "name" | "lost">;
	/** Opens the agent in the terminal it continues in. */
	onReconnected: (terminalId: string) => void;
}

/**
 * An agent whose terminal stopped continues in a new one as soon as it is opened here. This
 * says so, and offers to try again when that failed or cannot be done.
 */
export function LostNotice({ agent, onReconnected }: LostNoticeProps) {
	const actions = useCityActions();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const tried = useRef<string | null>(null);
	const lost = agent.lost;
	const canTry = !!lost && lost.resumable && !lost.reconnecting;

	const reconnect = async () => {
		setBusy(true);
		setError(null);
		try {
			onReconnected((await actions.reconnect(agent.terminalId)).terminalId);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once for each disconnected agent that is opened
	useEffect(() => {
		if (!canTry || tried.current === agent.terminalId) return;
		tried.current = agent.terminalId;
		void reconnect();
	}, [canTry, agent.terminalId]);

	if (!lost) return null;
	if (lost.reconnecting || busy)
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
					? `Its terminal stopped and it could not be continued in a new one. ${agent.name} keeps its name, seat and list.`
					: "Its terminal stopped, and its conversation can't continue in a new one. Remove it, or start a new agent in its workspace."}
			</p>
			{lost.resumable ? (
				<Button
					size="sm"
					className="h-7 gap-1.5 self-start text-[12px]"
					onClick={() => void reconnect()}
				>
					<LuRotateCcw className="size-3.5" />
					Try again
				</Button>
			) : null}
			{error ? <p className="text-red-500">{error}</p> : null}
		</div>
	);
}
