import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { LuExternalLink } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { CityWorkspace } from "../../../../../../../../types";
import { AgentIcon } from "../../../AgentIcon";
import { StatusBadge } from "../../../StatusBadge";

interface WorkspaceDetailsProps {
	workspace: CityWorkspace;
	onSelectAgent: (terminalId: string) => void;
}

export function WorkspaceDetails({
	workspace,
	onSelectAgent,
}: WorkspaceDetailsProps) {
	const navigate = useNavigate();
	const count = workspace.agents.length;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
			{workspace.branch ? (
				<div className="truncate font-mono text-[11px] text-muted-foreground">
					{workspace.branch}
				</div>
			) : null}
			<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
				{count === 0
					? "No agents running here"
					: `${count} agent${count === 1 ? "" : "s"} here`}
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
