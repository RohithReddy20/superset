import { Button } from "@superset/ui/button";
import { LuBuilding2, LuLoaderCircle } from "react-icons/lu";

interface EmptyStateProps {
	title: string;
	hint?: string;
	/** Shows a spinner in place of the icon: something is still loading. */
	busy?: boolean;
	action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, hint, busy, action }: EmptyStateProps) {
	return (
		<div
			role={busy ? "status" : undefined}
			className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
		>
			<span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				{busy ? (
					<LuLoaderCircle className="size-5 motion-safe:animate-spin" />
				) : (
					<LuBuilding2 className="size-5" />
				)}
			</span>
			<p className="text-sm font-medium text-foreground">{title}</p>
			{hint ? (
				<p className="max-w-sm text-[13px] text-muted-foreground">{hint}</p>
			) : null}
			{action ? (
				<Button
					variant="outline"
					size="sm"
					className="mt-1"
					onClick={action.onClick}
				>
					{action.label}
				</Button>
			) : null}
		</div>
	);
}
