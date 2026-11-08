import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	LuCircleHelp,
	LuLocateFixed,
	LuMap,
	LuMinus,
	LuPlus,
	LuUsers,
} from "react-icons/lu";
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
	/** Every mouse and key control of this floor: what you do, then what it does. */
	help: Array<[string, string]>;
}

export function FloorControls({
	view,
	onZoomIn,
	onZoomOut,
	onFollowMe,
	onShowWholeOffice,
	onShowEveryone,
	wholeLabel = "Whole office",
	help,
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
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Controls"
						title="Controls"
					>
						<LuCircleHelp />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-80 p-3">
					<h3 className="mb-2 text-[12px] font-medium">Controls</h3>
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
						{help.map(([gesture, effect]) => (
							<div key={gesture} className="contents">
								<dt className="font-medium text-foreground">{gesture}</dt>
								<dd className="text-muted-foreground">{effect}</dd>
							</div>
						))}
					</dl>
				</PopoverContent>
			</Popover>
		</div>
	);
}
