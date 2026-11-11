import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";

interface PanelHeaderProps {
	/** A mark in front of the title: an agent's CLI, a room's icon. */
	icon: ReactNode;
	title: ReactNode;
	/** One muted line under the title: where this is. */
	meta?: ReactNode;
	/** Buttons before the close button. */
	actions?: ReactNode;
	onClose: () => void;
}

/** The top of the side panel: what is open, where it is, and how to close it. */
export function PanelHeader({
	icon,
	title,
	meta,
	actions,
	onClose,
}: PanelHeaderProps) {
	return (
		<header className="flex shrink-0 items-start gap-2.5 border-b border-border px-3 py-2.5">
			<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
				{icon}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex min-h-6 min-w-0 items-center gap-2">{title}</div>
				{meta ? (
					<div className="truncate text-[12px] text-muted-foreground">
						{meta}
					</div>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-0.5">
				{actions}
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close"
					title="Close (Esc)"
					onClick={onClose}
				>
					<LuX />
				</Button>
			</div>
		</header>
	);
}
