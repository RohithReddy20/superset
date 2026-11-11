import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { useCityActions } from "../../../../../../../../hooks/useCityActions";
import type { CityAgent } from "../../../../../../../../types";

interface RemoveAgentProps {
	agent: Pick<CityAgent, "terminalId" | "name">;
	onRemoved: () => void;
}

/** Ends an agent for good, after a second click. */
export function RemoveAgent({ agent, onRemoved }: RemoveAgentProps) {
	const actions = useCityActions();
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const remove = async () => {
		setBusy(true);
		setError(null);
		try {
			await actions.remove(agent.terminalId);
			onRemoved();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
			setConfirming(false);
		}
	};

	if (!confirming)
		return (
			<Button
				variant="ghost"
				size="sm"
				className="h-6 justify-start gap-1.5 self-start px-1 text-[11px] text-muted-foreground"
				onClick={() => setConfirming(true)}
			>
				<LuTrash2 className="size-3" />
				Remove {agent.name}…
				{error ? <span className="text-red-500">{error}</span> : null}
			</Button>
		);

	return (
		<div className="flex flex-wrap items-center gap-1.5 text-[12px]">
			<span>End {agent.name} and close its terminal?</span>
			<Button
				variant="destructive"
				size="sm"
				className="h-7 text-[12px]"
				disabled={busy}
				onClick={() => void remove()}
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
	);
}
