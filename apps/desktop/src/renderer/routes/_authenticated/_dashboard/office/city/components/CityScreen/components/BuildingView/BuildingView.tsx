import { useMemo, useState } from "react";
import type { CityProject } from "../../../../types";
import { AgentPanel, type BuildingSelection } from "./components/AgentPanel";
import { BuildingFloor } from "./components/BuildingFloor";
import { GroupBox } from "./components/GroupBox";

interface BuildingViewProps {
	project: CityProject;
}

export function BuildingView({ project }: BuildingViewProps) {
	const [selection, setSelection] = useState<BuildingSelection | null>(null);
	const [picked, setPicked] = useState<string[]>([]);
	const selectAgent = (id: string) => setSelection({ kind: "agent", id });
	const agents = useMemo(
		() => project.workspaces.flatMap((w) => w.agents),
		[project],
	);
	const group = useMemo(
		() => agents.filter((a) => picked.includes(a.terminalId)),
		[agents, picked],
	);
	const workspaceNames = useMemo(
		() => new Map(project.workspaces.map((w) => [w.id, w.name])),
		[project],
	);

	return (
		<div className="flex h-full w-full">
			<div className="relative min-w-0 flex-1 bg-muted">
				<BuildingFloor
					project={project}
					selectedId={selection?.kind === "agent" ? selection.id : null}
					picked={picked}
					onPick={setPicked}
					onSelectAgent={selectAgent}
					onSelectWorkspace={(id) => setSelection({ kind: "workspace", id })}
				/>
				{group.length > 1 ? (
					<GroupBox
						agents={group}
						workspaceNames={workspaceNames}
						onSelectAgent={selectAgent}
						onClose={() => setPicked([])}
					/>
				) : null}
			</div>
			{selection ? (
				<AgentPanel
					project={project}
					selection={selection}
					onSelectAgent={selectAgent}
					onClose={() => setSelection(null)}
				/>
			) : null}
		</div>
	);
}
