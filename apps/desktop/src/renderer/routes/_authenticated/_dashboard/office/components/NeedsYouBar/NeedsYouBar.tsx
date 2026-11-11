import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuBell, LuBellRing } from "react-icons/lu";
import { useNeedsYou } from "../../hooks/useNeedsYou";
import type { NeedsYouTarget } from "../../utils/needsYou";
import { NeedsYouChip } from "./components/NeedsYouChip";
import { YourList } from "./components/YourList";

interface NeedsYouBarProps {
	/** The agent whose panel is open; its chips are marked. */
	openAgentId?: string | null;
	/** The building that is open; chips of its own agents leave its name out. */
	insideProject?: string | null;
}

/** One line under the header with everything that waits on you; a click opens it. */
export function NeedsYouBar({ openAgentId, insideProject }: NeedsYouBarProps) {
	const items = useNeedsYou();
	const navigate = useNavigate();
	const urgent = items.filter((i) => i.reason !== "review").length;
	const Bell = items.length === 0 ? LuBell : LuBellRing;

	const open = (target: NeedsYouTarget) =>
		navigate({
			to: "/office/city",
			search: { project: target.projectId, agent: target.terminalId },
		});

	return (
		<section
			aria-label="Needs you"
			className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-background pl-3 pr-2"
		>
			<span
				className={cn(
					"flex shrink-0 items-center gap-1.5 text-[12px] font-medium",
					urgent > 0 ? "text-orange-500" : "text-muted-foreground",
				)}
			>
				<Bell className="size-3.5" />
				{items.length === 0 ? "Nothing needs you right now" : "Needs you"}
				{items.length > 0 ? (
					<span
						key={items.length}
						className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-foreground motion-safe:animate-in motion-safe:zoom-in-75"
					>
						{items.length}
					</span>
				) : null}
			</span>
			<ul
				onWheel={(event) => {
					if (Math.abs(event.deltaY) > Math.abs(event.deltaX))
						event.currentTarget.scrollLeft += event.deltaY;
				}}
				className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none]"
			>
				{items.map((item) => (
					<li
						key={item.id}
						className="shrink-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-200"
					>
						<NeedsYouChip
							item={item}
							current={item.target.terminalId === openAgentId}
							where={
								insideProject && item.where.endsWith(` · ${insideProject}`)
									? item.where.slice(0, -` · ${insideProject}`.length)
									: item.where
							}
							onOpen={() => open(item.target)}
						/>
					</li>
				))}
			</ul>
			<YourList />
		</section>
	);
}
