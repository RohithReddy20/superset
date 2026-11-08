import { cn } from "@superset/ui/utils";
import { LuBot } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";

export function AgentIcon({
	agentId,
	className,
}: {
	agentId: string;
	className?: string;
}) {
	const icon = usePresetIcon(agentId);
	return icon ? (
		<img
			src={icon}
			alt=""
			className={cn("size-4 shrink-0 object-contain", className)}
		/>
	) : (
		<LuBot className={cn("size-4 shrink-0", className)} />
	);
}
