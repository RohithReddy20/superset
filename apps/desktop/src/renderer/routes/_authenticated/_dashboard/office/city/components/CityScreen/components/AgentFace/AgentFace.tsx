import { cn } from "@superset/ui/utils";
import {
	lookFor,
	lookKey,
	renderFace,
} from "../../../../../components/OfficeFloor/scene/pixel";

interface AgentFaceProps {
	/** The agent's terminal: its face on the floor is drawn from the same id. */
	terminalId: string;
	className?: string;
}

/** The face an agent has on the floor, so a row or a panel reads as the same person. */
export function AgentFace({ terminalId, className }: AgentFaceProps) {
	const look = lookFor(terminalId);
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
