import { formatRelativeTime } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { LuBot, LuExternalLink, LuX } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { STATUS_COLORS, STATUS_LABELS } from "../../../../../../constants";
import type {
	CityAgent,
	CityProject,
	CityWorkspace,
} from "../../../../../../types";

export type BuildingSelection =
	| { kind: "agent"; id: string }
	| { kind: "workspace"; id: string };

interface AgentPanelProps {
	project: CityProject;
	selection: BuildingSelection;
	onSelectAgent: (terminalId: string) => void;
	onClose: () => void;
}

const SCREEN_POLL_MS = 2000;
const SCREEN_CHARS = 4000;

export function AgentPanel({
	project,
	selection,
	onSelectAgent,
	onClose,
}: AgentPanelProps) {
	const agent =
		selection.kind === "agent"
			? project.workspaces
					.flatMap((w) => w.agents)
					.find((a) => a.terminalId === selection.id)
			: undefined;
	const workspace = project.workspaces.find((w) =>
		agent ? w.id === agent.workspaceId : w.id === selection.id,
	);

	return (
		<aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background">
			<div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
				<span className="truncate text-sm font-medium">
					{agent ? agent.name : (workspace?.name ?? "Gone")}
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
			{agent && workspace ? (
				<AgentDetails agent={agent} workspace={workspace} />
			) : workspace ? (
				<WorkspaceDetails workspace={workspace} onSelectAgent={onSelectAgent} />
			) : (
				<p className="p-3 text-sm text-muted-foreground">
					This agent has left: its terminal closed.
				</p>
			)}
		</aside>
	);
}

function AgentDetails({
	agent,
	workspace,
}: {
	agent: CityAgent;
	workspace: CityWorkspace;
}) {
	const navigate = useNavigate();
	const { activeHostUrl } = useLocalHostService();
	const screenRef = useRef<HTMLPreElement>(null);
	const screen = useQuery({
		queryKey: ["city", "screen", activeHostUrl, agent.terminalId],
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("No local host");
			return getHostServiceClientByUrl(activeHostUrl).terminal.transcript.query(
				{
					terminalId: agent.terminalId,
					workspaceId: agent.workspaceId,
					maxChars: SCREEN_CHARS,
				},
			);
		},
		refetchInterval: SCREEN_POLL_MS,
	});
	const text = screen.data?.text ?? "";

	useEffect(() => {
		const node = screenRef.current;
		if (node && text) node.scrollTop = node.scrollHeight;
	}, [text]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
			<div className="flex items-center gap-2">
				<AgentIcon agentId={agent.agentId} />
				<div className="min-w-0 flex-1">
					<div className="truncate text-[13px]">
						in <span className="font-medium">{workspace.name}</span>
					</div>
					{workspace.branch ? (
						<div className="truncate font-mono text-[11px] text-muted-foreground">
							{workspace.branch}
						</div>
					) : null}
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-[12px]">
				<StatusBadge status={agent.status} />
				<span className="text-muted-foreground">
					last change {formatRelativeTime(agent.lastEventAt)}
				</span>
				{agent.subagents > 0 ? (
					<span className="text-muted-foreground">
						· {agent.subagents} helper{agent.subagents === 1 ? "" : "s"} working
						for it
					</span>
				) : null}
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-1">
				<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
					Its terminal, latest output
				</span>
				<pre
					ref={screenRef}
					className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-snug text-foreground"
				>
					{screen.isError
						? "Could not read the terminal."
						: text || (screen.isLoading ? "Reading…" : "Nothing yet.")}
				</pre>
			</div>
			<Button
				className="gap-1.5"
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
				Open its terminal
			</Button>
		</div>
	);
}

function WorkspaceDetails({
	workspace,
	onSelectAgent,
}: {
	workspace: CityWorkspace;
	onSelectAgent: (terminalId: string) => void;
}) {
	const navigate = useNavigate();
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
			{workspace.branch ? (
				<div className="truncate font-mono text-[11px] text-muted-foreground">
					{workspace.branch}
				</div>
			) : null}
			<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
				{workspace.agents.length === 0
					? "No agents running here"
					: `${workspace.agents.length} agent${workspace.agents.length === 1 ? "" : "s"} here`}
			</span>
			<div className="flex flex-col gap-1">
				{workspace.agents.map((agent) => (
					<button
						key={agent.terminalId}
						type="button"
						onClick={() => onSelectAgent(agent.terminalId)}
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
					>
						<AgentIcon agentId={agent.agentId} />
						<span className="min-w-0 flex-1 truncate">{agent.name}</span>
						<StatusBadge status={agent.status} />
					</button>
				))}
			</div>
			<Button
				variant="outline"
				className="mt-auto gap-1.5"
				onClick={() => void navigateToV2Workspace(workspace.id, navigate)}
			>
				<LuExternalLink className="size-3.5" />
				Open workspace
			</Button>
		</div>
	);
}

function AgentIcon({ agentId }: { agentId: string }) {
	const icon = usePresetIcon(agentId);
	return icon ? (
		<img src={icon} alt="" className="size-4 shrink-0 object-contain" />
	) : (
		<LuBot className="size-4 shrink-0" />
	);
}

function StatusBadge({ status }: { status: CityAgent["status"] }) {
	return (
		<span className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]">
			<span
				className={cn(
					"size-1.5 rounded-full",
					status === "permission" && "animate-pulse",
				)}
				style={{ background: STATUS_COLORS[status] }}
			/>
			{STATUS_LABELS[status]}
		</span>
	);
}
