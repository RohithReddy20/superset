import { useMemo } from "react";
import { useCityActions } from "../../../../hooks/useCityActions";
import type { CityAgent, CityProject } from "../../../../types";
import { presentIn } from "../../../../utils/buildingSnapshot";
import type { BuildingSelection } from "../AgentPanel";
import { BuildingFloor } from "./components/BuildingFloor";
import { GroupBox } from "./components/GroupBox";

interface BuildingViewProps {
	project: CityProject;
	/** Every agent in the city, so visitors sitting here are found. */
	everyone: CityAgent[];
	selection: BuildingSelection | null;
	/** The city's agents are loaded. */
	ready: boolean;
	/** Agents picked for a group message. */
	picked: string[];
	onPick: (terminalIds: string[]) => void;
	onSelect: (selection: BuildingSelection | null) => void;
}

export function BuildingView({
	project,
	everyone,
	selection,
	ready,
	picked,
	onPick,
	onSelect,
}: BuildingViewProps) {
	const actions = useCityActions();
	const selectAgent = (id: string) => onSelect({ kind: "agent", id });
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
		<div className="relative h-full w-full bg-muted">
			<BuildingFloor
				project={project}
				present={present}
				selectedId={selection?.kind === "agent" ? selection.id : null}
				selectedRoomId={selection?.kind === "room" ? selection.id : null}
				ready={ready}
				picked={picked}
				onPick={onPick}
				onSelectAgent={selectAgent}
				onSelectWorkspace={(id) => onSelect({ kind: "room", id })}
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
					onClose={() => onPick([])}
				/>
			) : null}
		</div>
	);
}
