import { cn } from "@superset/ui/utils";
import { LuList, LuMap } from "react-icons/lu";

export type CityViewMode = "map" | "list";

const MODES = [
	["map", "Map", LuMap],
	["list", "List", LuList],
] as const;

interface ViewSwitchProps {
	view: CityViewMode;
	onChange: (view: CityViewMode) => void;
}

export function ViewSwitch({ view, onChange }: ViewSwitchProps) {
	return (
		<fieldset
			aria-label="Show as"
			className="flex items-center rounded-md border border-border p-0.5"
		>
			{MODES.map(([mode, label, Icon]) => (
				<button
					key={mode}
					type="button"
					aria-pressed={view === mode}
					onClick={() => onChange(mode)}
					className={cn(
						"flex items-center gap-1.5 rounded px-2 py-0.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						view === mode
							? "bg-fill-selected text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<Icon className="size-3.5" />
					{label}
				</button>
			))}
		</fieldset>
	);
}
