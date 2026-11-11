import { Button } from "@superset/ui/button";
import { LuLoaderCircle, LuUnplug } from "react-icons/lu";

interface HostTroubleProps {
	/** A try is under way right now. */
	trying: boolean;
	onRetry: () => void;
}

/** A line under the header while this machine's host does not answer; the city stays as it was last seen. */
export function HostTrouble({ trying, onRetry }: HostTroubleProps) {
	return (
		<output className="flex h-8 shrink-0 items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 text-[12px] motion-safe:animate-in motion-safe:fade-in">
			{trying ? (
				<LuLoaderCircle className="size-3.5 shrink-0 text-amber-500 motion-safe:animate-spin" />
			) : (
				<LuUnplug className="size-3.5 shrink-0 text-amber-500" />
			)}
			<span className="min-w-0 flex-1 truncate">
				<span className="font-medium">
					This machine's host is not answering.
				</span>{" "}
				The city shows what was last seen and catches up by itself.
			</span>
			<Button
				variant="ghost"
				size="sm"
				className="h-6 shrink-0 px-2 text-[12px]"
				disabled={trying}
				onClick={onRetry}
			>
				Try now
			</Button>
		</output>
	);
}
