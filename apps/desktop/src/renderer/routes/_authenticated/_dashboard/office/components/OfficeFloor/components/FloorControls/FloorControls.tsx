import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { LuCircleHelp, LuMap, LuMinus, LuPlus, LuUsers } from "react-icons/lu";
import type { SceneView } from "../../scene";

interface FloorControlsProps {
	view: SceneView;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onShowWholeOffice: () => void;
	onShowEveryone: () => void;
	wholeLabel?: string;
	/** Every mouse and key control of this floor: what you do, then what it does. */
	help: Array<[string, string]>;
}

const FRAME =
	"flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function FloorControls({
	view,
	onZoomIn,
	onZoomOut,
	onShowWholeOffice,
	onShowEveryone,
	wholeLabel = "Whole office",
	help,
}: FloorControlsProps) {
	const frames = [
		{
			mode: "everyone",
			label: "Everyone",
			title: "Frame everyone on this floor",
			Icon: LuUsers,
			show: onShowEveryone,
		},
		{
			mode: "whole",
			label: wholeLabel,
			title: "Show all of it",
			Icon: LuMap,
			show: onShowWholeOffice,
		},
	] as const;
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
			<span className="mx-0.5 h-4 w-px bg-border" />
			{frames.map(({ mode, label, title, Icon, show }) => (
				<button
					key={mode}
					type="button"
					aria-pressed={view.mode === mode}
					title={title}
					onClick={show}
					className={cn(
						FRAME,
						view.mode === mode
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
				>
					<Icon className="size-3.5" />
					<span className="hidden @[520px]/floor:inline">{label}</span>
				</button>
			))}
			<span className="mx-0.5 h-4 w-px bg-border" />
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
