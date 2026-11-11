import { cn } from "@superset/ui/utils";
import { useState } from "react";

const MAX_CHARS = 600;
const MAX_LINES = 8;
const BRIEF_CHARS = 140;
const BRIEF_LINES = 2;

/** Message text that folds to a few lines when it is long, with a toggle to read all of it. */
export function LongText({
	text,
	className,
	brief = false,
}: {
	text: string;
	className?: string;
	/** Folds to two lines already when it is a few lines long, for text that is rarely read. */
	brief?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const long =
		text.length > (brief ? BRIEF_CHARS : MAX_CHARS) ||
		text.split("\n").length > (brief ? BRIEF_LINES : MAX_LINES);
	return (
		<div className={className}>
			<p
				className={cn(
					"whitespace-pre-wrap break-words",
					long && !open && (brief ? "line-clamp-2" : "line-clamp-6"),
				)}
			>
				{text}
			</p>
			{long ? (
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen((v) => !v)}
					className="mt-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
				>
					{open ? "Show less" : "Show more"}
				</button>
			) : null}
		</div>
	);
}
