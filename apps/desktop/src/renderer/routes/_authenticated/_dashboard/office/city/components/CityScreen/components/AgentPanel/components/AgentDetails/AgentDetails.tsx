import { formatRelativeTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import { useAgentInput } from "../../../../../../hooks/useAgentInput";
import { useAgentTranscripts } from "../../../../../../hooks/useAgentTranscript";
import type {
	CityAgent,
	CityHandover,
	CityProject,
} from "../../../../../../types";
import { AgentIcon } from "../../../AgentIcon";
import { MessageBox } from "../../../MessageBox";
import { StatusBadge } from "../../../StatusBadge";
import { AskBox } from "./components/AskBox";
import { Conversation } from "./components/Conversation";
import { HandoverBox } from "./components/HandoverBox";
import { HistoryBox } from "./components/HistoryBox";
import { KeyButtons } from "./components/KeyButtons";
import { ListBox } from "./components/ListBox";
import { LostNotice } from "./components/LostNotice";
import { RemoveAgent } from "./components/RemoveAgent";
import { ScreenQuestion } from "./components/ScreenQuestion";
import { SeatRow } from "./components/SeatRow";

interface AgentDetailsProps {
	agent: CityAgent;
	projects: CityProject[];
	handovers: CityHandover[];
	onSelectAgent: (terminalId: string) => void;
	onRemoved: () => void;
}

export function AgentDetails({
	agent,
	projects,
	handovers,
	onSelectAgent,
	onRemoved,
}: AgentDetailsProps) {
	const project = projects.find((p) => p.id === agent.projectId);
	const workspace = project?.workspaces.find((w) => w.id === agent.workspaceId);
	const navigate = useNavigate();
	const input = useAgentInput();
	const [transcript] = useAgentTranscripts([agent]);
	const [keyError, setKeyError] = useState<string | null>(null);
	const markTerminalSeen = useV2NotificationStore((s) => s.markTerminalSeen);
	const { terminalId, status, lastEventAt } = agent;
	const lost = status === "lost";
	useEffect(() => {
		if (status === "review") markTerminalSeen(terminalId, lastEventAt);
	}, [status, terminalId, lastEventAt, markTerminalSeen]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
			<div className="flex items-center gap-2">
				<AgentIcon agentId={agent.agentId} />
				<div className="min-w-0 flex-1">
					<div className="truncate text-[13px]">
						{agent.kind}
						{agent.handle ? (
							<span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
								@{agent.handle}
							</span>
						) : null}
					</div>
					<div className="truncate text-[12px] text-muted-foreground">
						works in{" "}
						<span className="text-foreground">{agent.workspaceName}</span>
						{project ? ` · ${project.name}` : ""}
					</div>
					{workspace?.branch ? (
						<div className="truncate font-mono text-[11px] text-muted-foreground">
							{workspace.branch}
						</div>
					) : null}
				</div>
				<Button
					variant="ghost"
					size="sm"
					title="Open its terminal"
					className="gap-1.5 text-xs"
					onClick={() =>
						void navigateToV2Workspace(agent.workspaceId, navigate, {
							search: {
								terminalId: agent.terminalId,
								focusRequestId: crypto.randomUUID(),
							},
						})
					}
				>
					<LuExternalLink className="size-3.5" />
					Terminal
				</Button>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-[12px]">
				<StatusBadge status={agent.status} />
				<span className="text-muted-foreground">
					started {formatRelativeTime(agent.startedAt)} · last change{" "}
					{formatRelativeTime(agent.lastEventAt)}
				</span>
				{agent.subagents > 0 ? (
					<span className="text-muted-foreground">
						· {agent.subagents} helper{agent.subagents === 1 ? "" : "s"} working
						for it
					</span>
				) : null}
			</div>
			<LostNotice agent={agent} onReconnected={onSelectAgent} />
			<ListBox agent={agent} />
			<HistoryBox agent={agent} />
			<AskBox agent={agent} />
			<SeatRow agent={agent} projects={projects} />
			<HandoverBox
				agent={agent}
				projects={projects}
				handovers={handovers}
				onSelectAgent={onSelectAgent}
			/>
			<RemoveAgent agent={agent} onRemoved={onRemoved} />
			{lost ? null : <ScreenQuestion agent={agent} />}
			{lost ? (
				<p className="flex-1 text-[12px] text-muted-foreground">
					Its conversation shows here again once it is reconnected.
				</p>
			) : (
				<Conversation
					agentName={agent.name}
					transcript={transcript?.data}
					loading={!!transcript?.isLoading}
					failed={!!transcript?.isError}
				/>
			)}
			{lost ? null : (
				<KeyButtons
					onPress={(key) => {
						setKeyError(null);
						input
							.press(agent, key)
							.catch((cause: unknown) =>
								setKeyError(
									cause instanceof Error ? cause.message : String(cause),
								),
							);
					}}
				/>
			)}
			{keyError ? <p className="text-[11px] text-red-500">{keyError}</p> : null}
			<MessageBox
				disabled={lost}
				placeholder={
					lost
						? `Reconnect ${agent.name} to message it`
						: agent.status === "working"
							? `Message ${agent.name}; it reads it after this turn`
							: `Message ${agent.name}`
				}
				onSend={(text) => input.send(agent, text)}
			/>
		</div>
	);
}
