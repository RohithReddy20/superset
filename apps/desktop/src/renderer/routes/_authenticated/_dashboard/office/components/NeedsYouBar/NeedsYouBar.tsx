import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuBellRing } from "react-icons/lu";
import { useNeedsYou } from "../../hooks/useNeedsYou";
import type { NeedsYouTarget } from "../../utils/needsYou";
import { NeedsYouChip } from "./components/NeedsYouChip";
import { YourList } from "./components/YourList";

/** One line under the header with everything that waits on you; a click opens it. */
export function NeedsYouBar() {
	const items = useNeedsYou();
	const navigate = useNavigate();
	const urgent = items.filter((i) => i.reason !== "review").length;

	const open = (target: NeedsYouTarget) =>
		navigate({
			to: "/office/city",
			search: { project: target.projectId, agent: target.terminalId },
		});

	return (
		<section
			aria-label="Needs you"
			className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
		>
			<span
				className={cn(
					"flex shrink-0 items-center gap-1.5 text-[12px] font-medium",
					urgent > 0 ? "text-orange-500" : "text-muted-foreground",
				)}
			>
				<LuBellRing className="size-3.5" />
				{items.length === 0 ? "Nothing needs you right now" : "Needs you"}
				{items.length > 0 ? (
					<span className="rounded-full bg-muted px-1.5 text-[11px] text-foreground">
						{items.length}
					</span>
				) : null}
			</span>
			<ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
				{items.map((item) => (
					<li key={item.id} className="shrink-0">
						<NeedsYouChip item={item} onOpen={() => open(item.target)} />
					</li>
				))}
			</ul>
			<YourList />
		</section>
	);
}
