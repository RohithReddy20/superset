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
import { Conversation } from "./components/Conversation";
import { HandoverBox } from "./components/HandoverBox";
import { KeyButtons } from "./components/KeyButtons";
import { SeatRow } from "./components/SeatRow";

interface AgentDetailsProps {
	agent: CityAgent;
	projects: CityProject[];
	handovers: CityHandover[];
	onSelectAgent: (terminalId: string) => void;
}

export function AgentDetails({
	agent,
	projects,
	handovers,
	onSelectAgent,
}: AgentDetailsProps) {
	const project = projects.find((p) => p.id === agent.projectId);
	const workspace = project?.workspaces.find((w) => w.id === agent.workspaceId);
	const navigate = useNavigate();
	const input = useAgentInput();
	const [transcript] = useAgentTranscripts([agent]);
	const [keyError, setKeyError] = useState<string | null>(null);
	const markTerminalSeen = useV2NotificationStore((s) => s.markTerminalSeen);
	const { terminalId, status, lastEventAt } = agent;
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
			<SeatRow agent={agent} projects={projects} />
			<HandoverBox
				agent={agent}
				projects={projects}
				handovers={handovers}
				onSelectAgent={onSelectAgent}
			/>
			<Conversation
				agentName={agent.name}
				transcript={transcript?.data}
				loading={!!transcript?.isLoading}
				failed={!!transcript?.isError}
			/>
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
			{keyError ? <p className="text-[11px] text-red-500">{keyError}</p> : null}
			<MessageBox
				placeholder={
					agent.status === "working"
						? `Message ${agent.name}; it reads it after this turn`
						: `Message ${agent.name}`
				}
				onSend={(text) => input.send(agent, text)}
			/>
		</div>
	);
}
