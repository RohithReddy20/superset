import { cn } from "@superset/ui/utils";

interface PanelTabsProps<Tab extends string> {
	label: string;
	tabs: ReadonlyArray<{ id: Tab; label: string; count?: number }>;
	value: Tab;
	onChange: (tab: Tab) => void;
}

/** The side panel's sections as a row of tabs; the arrow keys move between them. */
export function PanelTabs<Tab extends string>({
	label,
	tabs,
	value,
	onChange,
}: PanelTabsProps<Tab>) {
	return (
		<div
			role="tablist"
			aria-label={label}
			className="flex shrink-0 items-center gap-3 border-b border-border px-3"
			onKeyDown={(event) => {
				const step =
					event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
				if (!step) return;
				const at = tabs.findIndex((t) => t.id === value);
				const next = tabs[(at + step + tabs.length) % tabs.length];
				if (!next) return;
				event.preventDefault();
				onChange(next.id);
				const buttons =
					event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]");
				buttons[tabs.indexOf(next)]?.focus();
			}}
		>
			{tabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					role="tab"
					aria-selected={value === tab.id}
					tabIndex={value === tab.id ? 0 : -1}
					onClick={() => onChange(tab.id)}
					className={cn(
						"-mb-px flex h-8 items-center gap-1.5 border-b-2 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						value === tab.id
							? "border-foreground font-medium text-foreground"
							: "border-transparent text-muted-foreground hover:text-foreground",
					)}
				>
					{tab.label}
					{tab.count ? (
						<span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
							{tab.count}
						</span>
					) : null}
				</button>
			))}
		</div>
	);
}
