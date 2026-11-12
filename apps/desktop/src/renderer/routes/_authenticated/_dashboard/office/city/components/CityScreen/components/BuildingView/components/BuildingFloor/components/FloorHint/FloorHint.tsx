import { cn } from "@superset/ui/utils";

interface FloorHintProps {
	/** Nobody sits in the building. */
	empty: boolean;
	/** The building has no workspace, so no agent can start in it yet. */
	noRooms: boolean;
	/** Fades the hint out once the floor was used; an empty building keeps it. */
	hidden: boolean;
}

/** One line at the bottom of a floor on what to do first; the "?" button holds every control. */
export function FloorHint({ empty, noRooms, hidden }: FloorHintProps) {
	return (
		<p
			aria-hidden={hidden && !empty}
			className={cn(
				"pointer-events-none absolute bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-center text-[12px] text-muted-foreground shadow-sm backdrop-blur transition-opacity duration-300",
				hidden && !empty && "opacity-0",
			)}
		>
			{noRooms ? (
				<>
					<span className="font-medium text-foreground">No rooms yet.</span> Add
					a workspace in the row above; agents start in a workspace.
				</>
			) : empty ? (
				<>
					<span className="font-medium text-foreground">
						Nobody is here yet.
					</span>{" "}
					Pick a CLI in the row above to start an agent in this building.
				</>
			) : (
				<>
					<span className="font-medium text-foreground">Click someone</span> to
					talk · drag them onto a room to sit there · click a room to open it
				</>
			)}
		</p>
	);
}
