import { cn } from "@superset/ui/utils";
import { memo } from "react";
import { CommentMarkdown } from "renderer/components/CommentMarkdown";
import { LongText } from "../../../../../../../../../../../components/LongText";
import type { Turn } from "../../../../../../../../../../utils/parseTurns";

interface ConversationTurnProps {
	turn: Turn;
	agentName: string;
}

/** One turn: what went into the agent's terminal on the right, its answer on the left. */
export const ConversationTurn = memo(function ConversationTurn({
	turn,
	agentName,
}: ConversationTurnProps) {
	const mine = turn.who === "you";
	return (
		<div className={cn("flex flex-col gap-0.5", mine && "items-end")}>
			<span className="text-[10px] text-muted-foreground">
				{mine ? `To ${agentName}` : agentName}
			</span>
			{mine ? (
				<LongText
					text={turn.text}
					className="w-fit max-w-[92%] rounded-lg bg-foreground px-2.5 py-1.5 text-[12px] leading-snug text-background [&_button]:text-background/70 [&_button:hover]:text-background"
				/>
			) : (
				<div className="w-fit max-w-[96%] rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] leading-snug text-foreground [overflow-wrap:anywhere] [&_code]:text-[11px] [&_h1]:text-[13px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_li]:my-0 [&_ol]:my-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-1 [&_pre]:text-[11px] [&_ul]:my-1">
					<CommentMarkdown body={turn.text} />
				</div>
			)}
		</div>
	);
});
