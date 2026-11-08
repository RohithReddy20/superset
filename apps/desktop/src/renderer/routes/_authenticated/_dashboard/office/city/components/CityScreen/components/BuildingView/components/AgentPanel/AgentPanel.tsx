import { Button } from "@superset/ui/button";
import { LuX } from "react-icons/lu";
import type { CityProject } from "../../../../../../types";
import { AgentDetails } from "./components/AgentDetails";
import { WorkspaceDetails } from "./components/WorkspaceDetails";

export type BuildingSelection =
	| { kind: "agent"; id: string }
	| { kind: "workspace"; id: string };

interface AgentPanelProps {
	project: CityProject;
	selection: BuildingSelection;
	onSelectAgent: (terminalId: string) => void;
	onClose: () => void;
}

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
		<aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-background">
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
				<AgentDetails
					key={agent.terminalId}
					agent={agent}
					workspace={workspace}
				/>
			) : workspace && selection.kind === "workspace" ? (
				<WorkspaceDetails workspace={workspace} onSelectAgent={onSelectAgent} />
			) : (
				<p className="p-3 text-sm text-muted-foreground">
					This agent has left: its terminal closed.
				</p>
			)}
		</aside>
	);
}
