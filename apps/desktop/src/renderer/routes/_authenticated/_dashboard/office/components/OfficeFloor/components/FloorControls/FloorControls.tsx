import { Button } from "@superset/ui/button";
import { LuLocateFixed, LuMap, LuMinus, LuPlus, LuUsers } from "react-icons/lu";
import type { SceneView } from "../../scene";

interface FloorControlsProps {
	view: SceneView;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFollowMe: () => void;
	onShowWholeOffice: () => void;
	/** Given, the view toggles between everyone on the floor and the whole floor instead of following you. */
	onShowEveryone?: () => void;
	wholeLabel?: string;
}

export function FloorControls({
	view,
	onZoomIn,
	onZoomOut,
	onFollowMe,
	onShowWholeOffice,
	onShowEveryone,
	wholeLabel = "Whole office",
}: FloorControlsProps) {
	return (
		<div className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-border bg-popover/90 p-1 shadow-md backdrop-blur">
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Zoom out"
				title="Zoom out"
				disabled={!view.canZoomOut}
				onClick={onZoomOut}
			>
				<LuMinus />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Zoom in"
				title="Zoom in"
				disabled={!view.canZoomIn}
				onClick={onZoomIn}
			>
				<LuPlus />
			</Button>
			{onShowEveryone ? (
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 px-2 text-xs"
					onClick={view.everyone ? onShowWholeOffice : onShowEveryone}
				>
					{view.everyone ? <LuMap /> : <LuUsers />}
					{view.everyone ? wholeLabel : "Everyone"}
				</Button>
			) : view.canFollow ? (
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 px-2 text-xs"
					onClick={view.following ? onShowWholeOffice : onFollowMe}
				>
					{view.following ? <LuMap /> : <LuLocateFixed />}
					{view.following ? wholeLabel : "Follow me"}
				</Button>
			) : null}
		</div>
	);
}
