import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef } from "react";
import type { AgentTranscript } from "../../../../../../../../hooks/useAgentTranscript";
import { parseTurns } from "../../../../../../../../utils/parseTurns";

const SHOWN_TURNS = 30;

interface ConversationProps {
	agentName: string;
	transcript: AgentTranscript | undefined;
	loading: boolean;
	failed: boolean;
}

/** Your messages and the agent's answers, from its own record; raw terminal output when it keeps none. */
export function Conversation({
	agentName,
	transcript,
	loading,
	failed,
}: ConversationProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const text = transcript?.text ?? "";
	const turns = useMemo(
		() =>
			transcript?.source === "harness"
				? parseTurns(text).slice(-SHOWN_TURNS)
				: null,
		[transcript?.source, text],
	);

	useEffect(() => {
		const node = scrollRef.current;
		if (node && text) node.scrollTop = node.scrollHeight;
	}, [text]);

	return (
		<div
			ref={scrollRef}
			className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/40 p-2"
		>
			{failed ? (
				<Note text="Could not read its terminal." />
			) : !text ? (
				<Note text={loading ? "Reading…" : "Nothing yet."} />
			) : turns ? (
				<div className="flex flex-col gap-2">
					{turns.map((turn, index) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: turns have no id and only grow at the end
							key={index}
							className={cn(
								"flex flex-col gap-0.5",
								turn.who === "you" && "items-end",
							)}
						>
							<span className="font-mono text-[10px] text-muted-foreground">
								{turn.who === "you" ? "To it" : agentName}
							</span>
							<div
								className={cn(
									"max-w-[92%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-[12px] leading-snug",
									turn.who === "you"
										? "bg-foreground text-background"
										: "border border-border bg-background text-foreground",
								)}
							>
								{turn.text}
							</div>
						</div>
					))}
				</div>
			) : (
				<pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-foreground">
					{text}
				</pre>
			)}
		</div>
	);
}

function Note({ text }: { text: string }) {
	return <p className="p-1 text-[12px] text-muted-foreground">{text}</p>;
}
