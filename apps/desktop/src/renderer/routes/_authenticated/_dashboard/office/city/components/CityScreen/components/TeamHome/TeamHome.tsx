import { useMemo, useState } from "react";
import { useCityTeam } from "../../../../hooks/useCityTeam";
import type { CityPlace, CityProject, CityRoom } from "../../../../types";
import {
	liveliestRoom,
	samePlace,
	teamRooms,
} from "../../../../utils/teamRooms";
import { EmptyState } from "../EmptyState";
import { RoomConversation } from "./components/RoomConversation";
import { TeamList } from "./components/TeamList";

interface TeamHomeProps {
	projects: CityProject[];
	rooms: CityRoom[];
	/** The room picked in the address. Unset opens the open agent's room, else where people last talked. */
	place: CityPlace | null;
	/** The agent whose panel is open beside this. */
	agentId: string | null;
	onSelectRoom: (place: CityPlace) => void;
	onSelectAgent: (terminalId: string) => void;
}

/** The team by room on the left, and the open room's conversation beside it. */
export function TeamHome({
	projects,
	rooms,
	place,
	agentId,
	onSelectRoom,
	onSelectAgent,
}: TeamHomeProps) {
	const { notes } = useCityTeam();
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const all = useMemo(() => teamRooms(projects), [projects]);
	const open =
		(place ? all.find((r) => samePlace(r.place, place)) : undefined) ??
		(agentId
			? all.find((r) => r.people.some((p) => p.terminalId === agentId))
			: undefined) ??
		liveliestRoom(all, notes) ??
		all[0];
	const draftKey = open ? `${open.place.projectId}/${open.place.roomId}` : "";

	return (
		<div className="flex h-full min-w-0">
			<TeamList
				rooms={all}
				open={open?.place ?? null}
				agentId={agentId}
				className={agentId ? "hidden @[820px]/city:flex" : undefined}
				onSelectRoom={onSelectRoom}
				onSelectAgent={onSelectAgent}
			/>
			{open ? (
				<RoomConversation
					key={draftKey}
					room={open}
					seats={rooms.find(
						(r) =>
							r.projectId === open.place.projectId &&
							r.roomId === open.place.roomId,
					)}
					draft={drafts[draftKey] ?? ""}
					onDraft={(text) => setDrafts((d) => ({ ...d, [draftKey]: text }))}
					onSelectAgent={onSelectAgent}
				/>
			) : (
				<div className="min-w-0 flex-1">
					<EmptyState
						title="No rooms yet"
						hint="A workspace is a room agents work in. Open a building in the Map view to add the first one."
					/>
				</div>
			)}
		</div>
	);
}
