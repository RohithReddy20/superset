import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { LuArrowDown } from "react-icons/lu";
import type { AgentTranscript } from "../../../../../../../../hooks/useAgentTranscript";
import { parseTurns } from "../../../../../../../../utils/parseTurns";
import { ConversationTurn } from "./components/ConversationTurn";

const SHOWN_TURNS = 30;
/** Closer to the end than this counts as reading the latest, so new text keeps the view there. */
const AT_END_PX = 48;

interface ConversationProps {
	agentName: string;
	transcript: AgentTranscript | undefined;
	loading: boolean;
	failed: boolean;
	/** The agent is in a turn; shown as a line at the end. */
	working: boolean;
}

/** Your messages and the agent's answers, from its own record; raw terminal output when it keeps none. */
export function Conversation({
	agentName,
	transcript,
	loading,
	failed,
	working,
}: ConversationProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const atEnd = useRef(true);
	const [newBelow, setNewBelow] = useState(false);
	const text = transcript?.text ?? "";
	const turns = useMemo(
		() =>
			transcript?.source === "harness"
				? parseTurns(text).slice(-SHOWN_TURNS)
				: null,
		[transcript?.source, text],
	);

	useLayoutEffect(() => {
		const node = scrollRef.current;
		if (!node || !text) return;
		if (atEnd.current) node.scrollTop = node.scrollHeight;
		else setNewBelow(true);
	}, [text]);

	const toEnd = () => {
		const node = scrollRef.current;
		if (!node) return;
		node.scrollTop = node.scrollHeight;
		atEnd.current = true;
		setNewBelow(false);
	};

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<div
				ref={scrollRef}
				onScroll={(event) => {
					const node = event.currentTarget;
					atEnd.current =
						node.scrollHeight - node.scrollTop - node.clientHeight < AT_END_PX;
					if (atEnd.current) setNewBelow(false);
				}}
				className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3"
			>
				{failed && !text ? (
					<p className="text-[12px] text-muted-foreground">
						Could not read {agentName}'s terminal. It is tried again shortly.
					</p>
				) : !text ? (
					<p className="text-[12px] text-muted-foreground">
						{loading
							? "Reading its conversation…"
							: `Nothing said yet. Write to ${agentName} below.`}
					</p>
				) : turns ? (
					<div className="flex flex-col gap-2.5">
						{turns.map((turn, index) => (
							<ConversationTurn
								// biome-ignore lint/suspicious/noArrayIndexKey: turns have no id and only grow at the end
								key={index}
								turn={turn}
								agentName={agentName}
							/>
						))}
					</div>
				) : (
					<pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-foreground">
						{text}
					</pre>
				)}
				{working ? (
					<output className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<span className="flex gap-0.5" aria-hidden>
							{[0, 1, 2].map((dot) => (
								<span
									key={dot}
									className="size-1 rounded-full bg-amber-500 motion-safe:animate-pulse"
									style={{ animationDelay: `${dot * 160}ms` }}
								/>
							))}
						</span>
						{agentName} is working
					</output>
				) : null}
			</div>
			{newBelow ? (
				<button
					type="button"
					onClick={toEnd}
					className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover px-2.5 py-1 text-[11px] font-medium shadow-md transition-colors hover:bg-fill-hover motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
				>
					<LuArrowDown className="size-3" />
					New below
				</button>
			) : null}
		</div>
	);
}
