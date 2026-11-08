import { useState } from "react";
import type { CityProject } from "../../../../types";
import { AgentPanel, type BuildingSelection } from "./components/AgentPanel";
import { BuildingFloor } from "./components/BuildingFloor";

interface BuildingViewProps {
	project: CityProject;
}

export function BuildingView({ project }: BuildingViewProps) {
	const [selection, setSelection] = useState<BuildingSelection | null>(null);
	const selectAgent = (id: string) => setSelection({ kind: "agent", id });

	return (
		<div className="flex h-full w-full">
			<div className="relative min-w-0 flex-1 bg-muted">
				<BuildingFloor
					project={project}
					selectedId={selection?.kind === "agent" ? selection.id : null}
					onSelectAgent={selectAgent}
					onSelectWorkspace={(id) => setSelection({ kind: "workspace", id })}
				/>
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
