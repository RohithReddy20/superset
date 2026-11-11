import { LuGhost, LuLoaderCircle } from "react-icons/lu";
import { PanelHeader } from "../PanelHeader";

interface GonePanelProps {
	what: "agent" | "room";
	/** The city is still loading: it may only not be here yet. */
	loading: boolean;
	onClose: () => void;
}

/** What the panel shows when the agent or room it was opened for is no longer in the city. */
export function GonePanel({ what, loading, onClose }: GonePanelProps) {
	if (loading)
		return (
			<>
				<PanelHeader
					icon={
						<LuLoaderCircle className="size-4 text-muted-foreground motion-safe:animate-spin" />
					}
					title={<span className="text-sm font-medium">Looking for it</span>}
					onClose={onClose}
				/>
				<p className="p-3 text-[13px] text-muted-foreground">
					The city is still loading.
				</p>
			</>
		);
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
