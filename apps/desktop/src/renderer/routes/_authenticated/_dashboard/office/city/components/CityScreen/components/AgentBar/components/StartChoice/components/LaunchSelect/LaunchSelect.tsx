import type { AgentModelOption } from "@superset/shared/agent-models";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";

const CLI_DEFAULT = "__default__";

interface LaunchSelectProps {
	label: string;
	options: readonly AgentModelOption[];
	/** Null is the CLI's own default. */
	value: string | null;
	onChange: (value: string | null) => void;
}

/** One launch choice of a CLI, a model or an effort, with the CLI's own default first. */
export function LaunchSelect({
	label,
	options,
	value,
	onChange,
}: LaunchSelectProps) {
	const groups: Array<{ name: string | undefined; items: AgentModelOption[] }> =
		[];
	for (const option of options) {
		const last = groups[groups.length - 1];
		if (last && last.name === option.group) last.items.push(option);
		else groups.push({ name: option.group, items: [option] });
	}
	return (
		<div className="flex min-w-0 flex-col gap-1 text-muted-foreground">
			{label}
			<Select
				value={value ?? CLI_DEFAULT}
				onValueChange={(next) => onChange(next === CLI_DEFAULT ? null : next)}
			>
				<SelectTrigger
					size="sm"
					aria-label={label}
					className="h-7 w-full gap-1 px-2 py-0 text-[12px] text-foreground data-[size=sm]:h-7"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent className="max-h-72">
					<SelectItem value={CLI_DEFAULT} className="text-[13px]">
						Default
					</SelectItem>
					{groups.map((group) => (
						<SelectGroup key={group.name ?? group.items[0]?.id}>
							{group.name ? (
								<SelectLabel className="text-[11px]">{group.name}</SelectLabel>
							) : null}
							{group.items.map((option) => (
								<SelectItem
									key={option.id}
									value={option.id}
									className="text-[13px]"
								>
									{option.label}
								</SelectItem>
							))}
						</SelectGroup>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
