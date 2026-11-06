import { Button } from "@superset/ui/button";
import { LuLocateFixed, LuMap, LuMinus, LuPlus } from "react-icons/lu";
import type { SceneView } from "../../scene";

interface FloorControlsProps {
	view: SceneView;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFollowMe: () => void;
	onShowWholeOffice: () => void;
}

export function FloorControls({
	view,
	onZoomIn,
	onZoomOut,
	onFollowMe,
	onShowWholeOffice,
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
			{view.canFollow ? (
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 px-2 text-xs"
					onClick={view.following ? onShowWholeOffice : onFollowMe}
				>
					{view.following ? <LuMap /> : <LuLocateFixed />}
					{view.following ? "Whole office" : "Follow me"}
				</Button>
			) : null}
		</div>
	);
}
