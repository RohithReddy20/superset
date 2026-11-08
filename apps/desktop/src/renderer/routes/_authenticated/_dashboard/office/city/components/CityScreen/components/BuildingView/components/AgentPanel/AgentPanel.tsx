import { Button } from "@superset/ui/button";
import { LuX } from "react-icons/lu";
import type {
	CityAgent,
	CityHandover,
	CityProject,
	CityRoom,
} from "../../../../../../types";
import { MEETING_ROOM } from "../../../../../../utils/buildingSnapshot";
import { AgentDetails } from "./components/AgentDetails";
import { RoomDetails } from "./components/RoomDetails";

export type BuildingSelection =
	| { kind: "agent"; id: string }
	| { kind: "room"; id: string };

interface AgentPanelProps {
	project: CityProject;
	projects: CityProject[];
	/** Every agent in the city, so a visitor can be found by its terminal. */
	everyone: CityAgent[];
	rooms: CityRoom[];
	handovers: CityHandover[];
	maxRelays: number;
	selection: BuildingSelection;
	onSelectAgent: (terminalId: string) => void;
	onClose: () => void;
}

export function AgentPanel({
	project,
	projects,
	everyone,
	rooms,
	handovers,
	maxRelays,
	selection,
	onSelectAgent,
	onClose,
}: AgentPanelProps) {
	const agent =
		selection.kind === "agent"
			? everyone.find((a) => a.terminalId === selection.id)
			: undefined;
	const roomName =
		selection.kind === "room"
			? selection.id === MEETING_ROOM.id
				? MEETING_ROOM.name
				: project.workspaces.find((w) => w.id === selection.id)?.name
			: undefined;

	return (
		<aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-background">
			<div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
				<span className="truncate text-sm font-medium">
					{agent?.name ?? roomName ?? "Gone"}
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
			{agent ? (
				<AgentDetails
					key={agent.terminalId}
					agent={agent}
					projects={projects}
					handovers={handovers}
					onSelectAgent={onSelectAgent}
				/>
			) : selection.kind === "room" && roomName ? (
				<RoomDetails
					project={project}
					roomId={selection.id}
					room={rooms.find(
						(r) => r.projectId === project.id && r.roomId === selection.id,
					)}
					people={everyone.filter(
						(a) =>
							a.place.projectId === project.id &&
							a.place.roomId === selection.id,
					)}
					maxRelays={maxRelays}
					onSelectAgent={onSelectAgent}
				/>
			) : (
				<p className="p-3 text-sm text-muted-foreground">
					This agent has left: its terminal closed.
				</p>
			)}
		</aside>
	);
}
