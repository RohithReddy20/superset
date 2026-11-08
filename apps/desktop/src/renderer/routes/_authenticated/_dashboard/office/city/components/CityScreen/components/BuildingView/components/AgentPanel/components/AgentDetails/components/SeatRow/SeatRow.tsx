import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuHouse } from "react-icons/lu";
import { useCityActions } from "../../../../../../../../../../hooks/useCityActions";
import { useOfficeRooms } from "../../../../../../../../../../hooks/useOfficeRooms";
import {
	type CityAgent,
	type CityProject,
	OFFICE_PLACE,
	type OfficeRoomRef,
} from "../../../../../../../../../../types";
import {
	isVisiting,
	MEETING_ROOM,
} from "../../../../../../../../../../utils/buildingSnapshot";

interface SeatRowProps {
	agent: CityAgent;
	projects: CityProject[];
}

/** Where the agent sits, a way home, and a pick of every room in the city to sit in instead. */
export function SeatRow({ agent, projects }: SeatRowProps) {
	const actions = useCityActions();
	const officeRooms = useOfficeRooms();
	const [error, setError] = useState<string | null>(null);
	const visiting = isVisiting(agent);
	const placeName = roomName(projects, officeRooms, agent.place);

	const run = (action: Promise<unknown>) => {
		setError(null);
		action.catch((cause: unknown) =>
			setError(cause instanceof Error ? cause.message : String(cause)),
		);
	};

	return (
		<div className="flex flex-col gap-1.5 rounded-md border border-border p-2 text-[12px]">
			<div className="flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate">
					{visiting ? (
						<>
							Sitting in <span className="font-medium">{placeName}</span>; still
							works in {agent.workspaceName}
						</>
					) : (
						"At its own desk"
					)}
				</span>
				{visiting ? (
					<Button
						variant="ghost"
						size="sm"
						className="h-6 gap-1 px-2 text-[11px]"
						onClick={() => run(actions.sendHome(agent.terminalId))}
					>
						<LuHouse className="size-3" />
						Send home
					</Button>
				) : null}
			</div>
			<select
				value=""
				aria-label="Sit somewhere else"
				onChange={(event) => {
					const [projectId, roomId] = event.target.value.split("/");
					if (projectId && roomId)
						run(actions.seat(agent.terminalId, { projectId, roomId }));
				}}
				className="h-7 rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
			>
				<option value="" disabled>
					Sit somewhere else in the city…
				</option>
				{officeRooms.length > 0 ? (
					<optgroup label="Office, with its teammates">
						{officeRooms.map((room) => (
							<option
								key={room.id}
								value={`${OFFICE_PLACE}/${room.id}`}
								disabled={
									agent.place.projectId === OFFICE_PLACE &&
									agent.place.roomId === room.id
								}
							>
								#{room.name}
							</option>
						))}
					</optgroup>
				) : null}
				{projects.map((project) => (
					<optgroup key={project.id} label={project.name}>
						{[
							...project.workspaces.map((w) => ({ id: w.id, name: w.name })),
							MEETING_ROOM,
						].map((room) => (
							<option
								key={room.id}
								value={`${project.id}/${room.id}`}
								disabled={
									agent.place.projectId === project.id &&
									agent.place.roomId === room.id
								}
							>
								{room.name}
							</option>
						))}
					</optgroup>
				))}
			</select>
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
		</div>
	);
}

function roomName(
	projects: CityProject[],
	officeRooms: OfficeRoomRef[],
	place: CityAgent["place"],
): string {
	if (place.projectId === OFFICE_PLACE)
		return `#${officeRooms.find((r) => r.id === place.roomId)?.name ?? place.roomId} (office)`;
	const project = projects.find((p) => p.id === place.projectId);
	const room =
		place.roomId === MEETING_ROOM.id
			? MEETING_ROOM.name
			: project?.workspaces.find((w) => w.id === place.roomId)?.name;
	return project ? `${room ?? "a room"} (${project.name})` : "another building";
}
