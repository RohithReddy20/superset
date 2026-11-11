import { LuGhost } from "react-icons/lu";
import { PanelHeader } from "../PanelHeader";

interface GonePanelProps {
	what: "agent" | "room";
	onClose: () => void;
}

/** What the panel shows when the agent or room it was opened for is no longer in the city. */
export function GonePanel({ what, onClose }: GonePanelProps) {
	return (
		<>
			<PanelHeader
				icon={<LuGhost className="size-4 text-muted-foreground" />}
				title={<span className="text-sm font-medium">Not here any more</span>}
				onClose={onClose}
			/>
			<p className="p-3 text-[13px] text-muted-foreground">
				{what === "agent"
					? "This agent has left: its terminal closed, or it was removed."
					: "This room is gone: its workspace is no longer on this machine."}
			</p>
		</>
	);
}
