import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";

interface ModeSwitchProps<Mode extends string> {
	label: string;
	modes: ReadonlyArray<{
		id: Mode;
		label: string;
		icon: IconType;
		title: string;
	}>;
	value: Mode;
	onChange: (mode: Mode) => void;
}

/** A small either-or switch, e.g. what the box under it sends. */
export function ModeSwitch<Mode extends string>({
	label,
	modes,
	value,
	onChange,
}: ModeSwitchProps<Mode>) {
	return (
		<fieldset aria-label={label} className="flex shrink-0 items-center gap-0.5">
			{modes.map(({ id, label: text, icon: Icon, title }) => (
				<button
					key={id}
					type="button"
					aria-pressed={value === id}
					title={title}
					onClick={() => onChange(id)}
					className={cn(
						"flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						value === id
							? "bg-fill-selected font-medium text-foreground"
							: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
					)}
				>
					<Icon className="size-3" />
					{text}
				</button>
			))}
		</fieldset>
	);
}
