import { useState } from "react";
import type {
	CityAgent,
	CityHandover,
	CityProject,
	CityRoom,
} from "../../../../types";
import { MEETING_ROOM } from "../../../../utils/buildingSnapshot";
import { AgentDetails } from "./components/AgentDetails";
import { GonePanel } from "./components/GonePanel";
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
	selection: BuildingSelection;
	onSelectAgent: (terminalId: string) => void;
	onClose: () => void;
}

/** The side panel for the agent or the room that is open. In a narrow window it lies over the floor. */
export function AgentPanel({
	project,
	projects,
	everyone,
	rooms,
	handovers,
	selection,
	onSelectAgent,
	onClose,
}: AgentPanelProps) {
	const [drafts, setDrafts] = useState<Record<string, string>>({});
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
	const draftKey = `${selection.kind}:${selection.id}`;
	const setDraft = (text: string) =>
		setDrafts((all) => ({ ...all, [draftKey]: text }));

	return (
		<aside
			aria-label={agent?.name ?? roomName ?? "Details"}
			className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,380px)] shrink-0 flex-col border-l border-border bg-background shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-3 motion-safe:duration-200 @[640px]/city:static @[640px]/city:w-[clamp(300px,38cqw,460px)] @[640px]/city:shadow-none"
		>
			{agent ? (
				<AgentDetails
					key={agent.terminalId}
					agent={agent}
					projects={projects}
					handovers={handovers}
					draft={drafts[draftKey] ?? ""}
					onDraft={setDraft}
					onSelectAgent={onSelectAgent}
					onClose={onClose}
				/>
			) : selection.kind === "room" && roomName ? (
				<RoomDetails
					key={selection.id}
					project={project}
					roomId={selection.id}
					roomName={roomName}
					room={rooms.find(
						(r) => r.projectId === project.id && r.roomId === selection.id,
					)}
					people={everyone.filter(
						(a) =>
							a.place.projectId === project.id &&
							a.place.roomId === selection.id,
					)}
					draft={drafts[draftKey] ?? ""}
					onDraft={setDraft}
					onSelectAgent={onSelectAgent}
					onClose={onClose}
				/>
			) : (
				<GonePanel
					what={selection.kind === "agent" ? "agent" : "room"}
					onClose={onClose}
				/>
			)}
		</aside>
	);
}
