import { cn } from "@superset/ui/utils";
import {
	lookFor,
	lookKey,
	renderFace,
} from "../../../../../components/OfficeFloor/scene/pixel";

interface AgentFaceProps {
	/** The agent's name: its face on the floor is drawn from it too. */
	name: string;
	className?: string;
}

/** The face an agent has on the floor, so a row or a panel reads as the same person. */
export function AgentFace({ name, className }: AgentFaceProps) {
	const look = lookFor(name);
	return (
		<img
			src={renderFace(look, lookKey(look))}
			alt=""
			draggable={false}
			className={cn(
				"size-5 shrink-0 rounded-full bg-muted object-cover [image-rendering:pixelated]",
				className,
			)}
		/>
	);
}
