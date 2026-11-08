import { useMemo, useState } from "react";
import { useCityActions } from "../../../../hooks/useCityActions";
import type { CityProject, CityRoom } from "../../../../types";
import { presentIn } from "../../../../utils/buildingSnapshot";
import { AgentPanel, type BuildingSelection } from "./components/AgentPanel";
import { BuildingFloor } from "./components/BuildingFloor";
import { GroupBox } from "./components/GroupBox";

interface BuildingViewProps {
	project: CityProject;
	projects: CityProject[];
	rooms: CityRoom[];
	maxRelays: number;
}

export function BuildingView({
	project,
	projects,
	rooms,
	maxRelays,
}: BuildingViewProps) {
	const actions = useCityActions();
	const [selection, setSelection] = useState<BuildingSelection | null>(null);
	const [picked, setPicked] = useState<string[]>([]);
	const selectAgent = (id: string) => setSelection({ kind: "agent", id });
	const everyone = useMemo(
		() => projects.flatMap((p) => p.workspaces.flatMap((w) => w.agents)),
		[projects],
	);
	const present = useMemo(
		() => presentIn(project.id, everyone),
		[project.id, everyone],
	);
	const group = useMemo(
		() => present.filter((a) => picked.includes(a.terminalId)),
		[present, picked],
	);
	const workspaceNames = useMemo(
		() => new Map(everyone.map((a) => [a.workspaceId, a.workspaceName])),
		[everyone],
	);

	return (
		<div className="flex h-full w-full">
			<div className="relative min-w-0 flex-1 bg-muted">
				<BuildingFloor
					project={project}
					present={present}
					selectedId={selection?.kind === "agent" ? selection.id : null}
					picked={picked}
					onPick={setPicked}
					onSelectAgent={selectAgent}
					onSelectWorkspace={(id) => setSelection({ kind: "room", id })}
					onSeat={async (ids, roomId) => {
						for (const id of ids)
							await actions.seat(id, { projectId: project.id, roomId });
					}}
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
					projects={projects}
					everyone={everyone}
					rooms={rooms}
					maxRelays={maxRelays}
					selection={selection}
					onSelectAgent={selectAgent}
					onClose={() => setSelection(null)}
				/>
			) : null}
		</div>
	);
}
