import { Button } from "@superset/ui/button";
import type { Key } from "../../../../../../../../hooks/useAgentInput";

const BUTTONS: Array<{ key: Key; label: string; title: string }> = [
	{ key: "up", label: "↑", title: "Arrow up" },
	{ key: "down", label: "↓", title: "Arrow down" },
	{ key: "enter", label: "Enter", title: "Press Enter" },
	{
		key: "escape",
		label: "Esc",
		title: "Press Esc: cancels a question, or stops the agent's turn",
	},
];

/** Keys for a choice the agent shows on its screen, such as a permission or "trust this folder?". */
export function KeyButtons({ onPress }: { onPress: (key: Key) => void }) {
	return (
		<div className="flex items-center gap-1">
			<span className="mr-1 text-[11px] text-muted-foreground">
				Answer its screen
			</span>
			{BUTTONS.map((button) => (
				<Button
					key={button.key}
					variant="outline"
					size="sm"
					title={button.title}
					className="h-6 px-2 font-mono text-[11px]"
					onClick={() => onPress(button.key)}
				>
					{button.label}
				</Button>
			))}
		</div>
	);
}
