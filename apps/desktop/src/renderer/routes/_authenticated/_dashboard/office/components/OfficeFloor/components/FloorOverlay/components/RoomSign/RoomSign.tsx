import { cn } from "@superset/ui/utils";
import { LuMessageSquare } from "react-icons/lu";

interface RoomSignProps {
	name: string;
	/** How many sit in the room. */
	people: number;
	selected: boolean;
	onSelect: () => void;
}

/** A room's name on the floor; a click opens the room. */
export function RoomSign({ name, people, selected, onSelect }: RoomSignProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			title={`${name}: ${people === 0 ? "nobody sits here" : `${people} sitting here`}. Click to open the room.`}
			className={cn(
				"pointer-events-auto flex max-w-[180px] items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				"group-data-[compact=true]/floor:gap-1 group-data-[compact=true]/floor:px-1.5 group-data-[compact=true]/floor:py-0.5 group-data-[compact=true]/floor:text-[10px]",
				selected
					? "border-foreground/60 bg-popover text-foreground"
					: "border-border bg-popover/85 text-foreground/90 hover:bg-popover hover:text-foreground",
			)}
		>
			<LuMessageSquare className="size-3 shrink-0 text-muted-foreground group-data-[compact=true]/floor:size-2.5" />
			<span className="min-w-0 truncate">{name}</span>
			{people > 0 ? (
				<span className="shrink-0 rounded-full bg-muted px-1 text-[10px] tabular-nums text-muted-foreground group-data-[compact=true]/floor:hidden">
					{people}
				</span>
			) : null}
		</button>
	);
}
