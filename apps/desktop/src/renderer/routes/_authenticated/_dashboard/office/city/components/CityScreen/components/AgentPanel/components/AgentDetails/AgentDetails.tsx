import { formatRelativeTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LuSquareTerminal } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import { useAgentTranscripts } from "../../../../../../hooks/useAgentTranscript";
import { useCityTeam } from "../../../../../../hooks/useCityTeam";
import {
	type CityAgent,
	type CityHandover,
	type CityProject,
	isOpenTodo,
} from "../../../../../../types";
import { isVisiting } from "../../../../../../utils/buildingSnapshot";
import { launchLabel } from "../../../../../../utils/launchLabel";
import { AgentFace } from "../../../AgentFace";
import { AgentIcon } from "../../../AgentIcon";
import { StatusBadge } from "../../../StatusBadge";
import { AgentName } from "../AgentName";
import { PanelHeader } from "../PanelHeader";
import { PanelTabs } from "../PanelTabs";
import { AskedYou } from "./components/AskedYou";
import { Composer } from "./components/Composer";
import { Conversation } from "./components/Conversation";
import { HistoryBox } from "./components/HistoryBox";
import { ListBox } from "./components/ListBox";
import { LostNotice } from "./components/LostNotice";
import { ManageTab } from "./components/ManageTab";
import { ScreenQuestion } from "./components/ScreenQuestion";

type Tab = "talk" | "list" | "history" | "manage";

interface AgentDetailsProps {
	agent: CityAgent;
	projects: CityProject[];
	handovers: CityHandover[];
	/** What is typed to this agent and not sent yet. */
	draft: string;
	onDraft: (text: string) => void;
	onSelectAgent: (terminalId: string) => void;
	onClose: () => void;
}

/**
 * One agent: what it waits on you for at the top, its conversation, and one box to write to it.
 * Its list, its history and the rarer actions are tabs.
 */
export function AgentDetails({
	agent,
	projects,
	handovers,
	draft,
	onDraft,
	onSelectAgent,
	onClose,
}: AgentDetailsProps) {
	const project = projects.find((p) => p.id === agent.projectId);
	const workspace = project?.workspaces.find((w) => w.id === agent.workspaceId);
	const navigate = useNavigate();
	const [transcript] = useAgentTranscripts([agent]);
	const { todos, unread, markRead, waiting } = useCityTeam();
	const [tab, setTab] = useState<Tab>(() =>
		unread.some((n) => n.fromId === agent.terminalId) ? "list" : "talk",
	);
	const markTerminalSeen = useV2NotificationStore((s) => s.markTerminalSeen);
	const { terminalId, status, lastEventAt } = agent;
	const lost = status === "lost";
	useEffect(() => {
		if (status === "review") markTerminalSeen(terminalId, lastEventAt);
	}, [status, terminalId, lastEventAt, markTerminalSeen]);

	const newest = unread.findLast((n) => n.fromId === terminalId)?.id;
	// biome-ignore lint/correctness/useExhaustiveDependencies: markRead is a new function each render
	useEffect(() => {
		if (newest) void markRead(terminalId).catch(() => {});
	}, [newest, terminalId]);

	const open = todos.filter(
		(t) => isOpenTodo(t) && t.ownerId === terminalId,
	).length;
	const held = waiting.filter((d) => d.toId === terminalId).length;
	const launch = launchLabel(agent);
	const place = isVisiting(agent)
		? projects
				.find((p) => p.id === agent.place.projectId)
				?.workspaces.find((w) => w.id === agent.place.roomId)?.name
		: undefined;

	return (
		<>
			<PanelHeader
				icon={<AgentFace name={agent.name} />}
				title={
					<>
						<AgentName agent={agent} />
						<StatusBadge status={agent.status} />
					</>
				}
				meta={
					<>
						<span title={workspace?.branch ?? undefined}>
							<AgentIcon
								agentId={agent.agentId}
								className="mr-1 inline size-3 align-[-2px]"
							/>
							{agent.kind}
							{launch ? ` · ${launch}` : ""}
							{agent.handle ? ` · @${agent.handle}` : ""} · works in{" "}
							<span className="text-foreground">{agent.workspaceName}</span>
							{isVisiting(agent) ? ` · sits in ${place ?? "another room"}` : ""}
						</span>
						<span className="block truncate text-[11px]">
							last change {formatRelativeTime(agent.lastEventAt)} · started{" "}
							{formatRelativeTime(agent.startedAt)}
							{agent.subagents > 0
								? ` · ${agent.subagents} helper${agent.subagents === 1 ? "" : "s"} working for it`
								: ""}
						</span>
					</>
				}
				actions={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Open its terminal"
						title="Open its terminal in its workspace"
						onClick={() =>
							void navigateToV2Workspace(agent.workspaceId, navigate, {
								search: {
									terminalId: agent.terminalId,
									focusRequestId: crypto.randomUUID(),
								},
							})
						}
					>
						<LuSquareTerminal />
					</Button>
				}
				onClose={onClose}
			/>
			<div className="flex max-h-[45%] shrink-0 flex-col gap-2 overflow-y-auto px-3 py-2.5 empty:hidden">
				<LostNotice agent={agent} onReconnected={onSelectAgent} />
				{lost ? null : <ScreenQuestion agent={agent} />}
				<AskedYou agent={agent} />
				{held > 0 ? (
					<p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[12px]">
						{held === 1 ? "1 message waits" : `${held} messages wait`} to reach{" "}
						{agent.name}; it gets {held === 1 ? "it" : "them"} when it is back.
					</p>
				) : null}
			</div>
			<PanelTabs
				label={`${agent.name}'s panel`}
				tabs={[
					{ id: "talk", label: "Talk" },
					{ id: "list", label: "List", count: open },
					{ id: "history", label: "History" },
					{ id: "manage", label: "Manage" },
				]}
				value={tab}
				onChange={setTab}
			/>
			<div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
				{tab === "talk" ? (
					lost ? (
						<p className="p-3 text-[12px] text-muted-foreground">
							Its conversation shows here again once it is reconnected.
						</p>
					) : (
						<Conversation
							agentName={agent.name}
							transcript={transcript?.data}
							loading={!!transcript?.isLoading}
							failed={!!transcript?.isError}
							working={agent.status === "working"}
						/>
					)
				) : tab === "list" ? (
					<ListBox agent={agent} />
				) : tab === "history" ? (
					<HistoryBox agent={agent} />
				) : (
					<ManageTab
						agent={agent}
						projects={projects}
						handovers={handovers}
						onSelectAgent={onSelectAgent}
						onRemoved={onClose}
					/>
				)}
			</div>
			<div className="shrink-0 border-t border-border p-2.5">
				<Composer agent={agent} draft={draft} onDraft={onDraft} />
			</div>
		</>
	);
}
