import { Button } from "@superset/ui/button";
import { LuX } from "react-icons/lu";
import { useAgentInput } from "../../../../../../hooks/useAgentInput";
import { useAgentTranscripts } from "../../../../../../hooks/useAgentTranscript";
import type { CityAgent } from "../../../../../../types";
import { lastReply } from "../../../../../../utils/parseTurns";
import { AgentIcon } from "../../../AgentIcon";
import { MessageBox } from "../../../MessageBox";
import { StatusBadge } from "../../../StatusBadge";

interface GroupBoxProps {
	agents: CityAgent[];
	workspaceNames: ReadonlyMap<string, string>;
	onSelectAgent: (terminalId: string) => void;
	onClose: () => void;
}

/** One message into each picked agent's terminal, and each one's latest words under its name. */
export function GroupBox({
	agents,
	workspaceNames,
	onSelectAgent,
	onClose,
}: GroupBoxProps) {
	const input = useAgentInput();
	const transcripts = useAgentTranscripts(agents);

	const sendToAll = async (text: string) => {
		const results = await Promise.allSettled(
			agents.map((agent) => input.send(agent, text)),
		);
		const failed = agents.filter((_, i) => results[i]?.status === "rejected");
		if (failed.length > 0)
			throw new Error(
				`Not delivered to ${failed.map((a) => a.name).join(", ")}: no agent is running in that terminal any more.`,
			);
		return `Sent to all ${agents.length}`;
	};

	return (
		<div className="absolute bottom-3 left-3 z-10 flex max-h-[min(460px,calc(100%-24px))] w-[min(380px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-border bg-popover/95 shadow-lg backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
			<div className="flex items-center gap-2 border-b border-border px-2.5 py-2 text-[12px]">
				<span className="min-w-0 flex-1 truncate font-medium text-foreground">
					Message {agents.length} agents
				</span>
				<span className="hidden text-[11px] text-muted-foreground sm:inline">
					Esc to clear
				</span>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close"
					onClick={onClose}
				>
					<LuX />
				</Button>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
				{agents.map((agent, i) => {
					const data = transcripts[i]?.data;
					const reply = data ? lastReply(data.text, data.source) : "";
					return (
						<button
							key={agent.terminalId}
							type="button"
							onClick={() => onSelectAgent(agent.terminalId)}
							className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
						>
							<span className="flex items-center gap-2 text-[12px]">
								<AgentIcon agentId={agent.agentId} className="size-3.5" />
								<span className="font-medium">{agent.name}</span>
								<span className="min-w-0 flex-1 truncate text-muted-foreground">
									{workspaceNames.get(agent.workspaceId)}
								</span>
								<StatusBadge status={agent.status} />
							</span>
							{reply ? (
								<span className="line-clamp-2 pl-5 text-[12px] text-muted-foreground">
									{reply}
								</span>
							) : null}
						</button>
					);
				})}
			</div>
			<div className="border-t border-border p-2">
				<MessageBox
					placeholder={`Message all ${agents.length}; each gets it in its terminal`}
					onSend={sendToAll}
				/>
			</div>
		</div>
	);
}
