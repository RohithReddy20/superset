import { cn } from "@superset/ui/utils";
import { type DragEvent, useEffect, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { TICK_MS, useNow } from "../../../../../../../hooks/useNow";
import { useCityActions } from "../../../../../../hooks/useCityActions";
import { useCityTeam } from "../../../../../../hooks/useCityTeam";
import type { CityPlace } from "../../../../../../types";
import { isVisiting } from "../../../../../../utils/buildingSnapshot";
import { samePlace, type TeamRoom } from "../../../../utils/teamRooms";
import { ProjectIcon } from "../../../ProjectIcon";
import { TeamRow } from "./components/TeamRow";
import { AGENT_DRAG_TYPE } from "./constants";
import { agentLine } from "./utils/agentLine";

interface TeamListProps {
	rooms: TeamRoom[];
	open: CityPlace | null;
	agentId: string | null;
	className?: string;
	onSelectRoom: (place: CityPlace) => void;
	onSelectAgent: (terminalId: string) => void;
}

const ERROR_MS = 5000;

const keyOf = (place: CityPlace) => `${place.projectId}/${place.roomId}`;

const ROOM =
	"flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** Everyone by the room they sit in. A click on a room opens its conversation; an agent dropped on a room sits there. */
export function TeamList({
	rooms,
	open,
	agentId,
	className,
	onSelectRoom,
	onSelectAgent,
}: TeamListProps) {
	const { todos, notes } = useCityTeam();
	const actions = useCityActions();
	const now = useNow(TICK_MS);
	const [over, setOver] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [emptyToggle, setEmptyToggle] = useState<{
		at: string;
		shown: boolean;
	} | null>(null);

	useEffect(() => {
		if (!error) return;
		const timer = setTimeout(() => setError(null), ERROR_MS);
		return () => clearTimeout(timer);
	}, [error]);
	const occupied = rooms.filter((r) => r.people.length > 0);
	const empty = rooms.filter((r) => r.people.length === 0);
	const openKey = open ? keyOf(open) : "";
	if (emptyToggle && emptyToggle.at !== openKey) setEmptyToggle(null);
	const showEmpty =
		emptyToggle?.at === openKey
			? emptyToggle.shown
			: occupied.length === 0 ||
				empty.some((r) => !!open && samePlace(r.place, open));
	const Chevron = showEmpty ? LuChevronDown : LuChevronRight;

	const dropOn = (room: TeamRoom) => ({
		onDragOver: (event: DragEvent<HTMLElement>) => {
			if (!event.dataTransfer.types.includes(AGENT_DRAG_TYPE)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			setOver(keyOf(room.place));
		},
		onDragLeave: (event: DragEvent<HTMLElement>) => {
			if (!event.currentTarget.contains(event.relatedTarget as Node | null))
				setOver(null);
		},
		onDrop: (event: DragEvent<HTMLElement>) => {
			const terminalId = event.dataTransfer.getData(AGENT_DRAG_TYPE);
			setOver(null);
			if (!terminalId) return;
			event.preventDefault();
			if (room.people.some((p) => p.terminalId === terminalId)) return;
			setError(null);
			actions
				.seat(terminalId, room.place)
				.catch((cause: unknown) =>
					setError(cause instanceof Error ? cause.message : String(cause)),
				);
		},
	});
	const roomButton = (room: TeamRoom) => (
		<button
			type="button"
			data-team-room={keyOf(room.place)}
			aria-current={open && samePlace(room.place, open) ? "true" : undefined}
			onClick={() => onSelectRoom(room.place)}
			className={cn(
				ROOM,
				open &&
					samePlace(room.place, open) &&
					"bg-fill-selected hover:bg-fill-selected",
			)}
		>
			<ProjectIcon project={room.project} className="size-3.5" />
			<span className="min-w-0 flex-1 truncate">
				<span className="font-medium">{room.name}</span>
				<span className="ml-1.5 text-[11px] text-muted-foreground">
					{room.project.name}
				</span>
			</span>
			{room.people.length > 0 ? (
				<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
					{room.people.length}
				</span>
			) : null}
		</button>
	);
	const dropRing = (room: TeamRoom) =>
		over === keyOf(room.place) && "bg-fill-hover ring-1 ring-inset ring-ring";

	return (
		<nav
			aria-label="Team"
			className={cn(
				"flex h-full w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border p-2",
				className,
			)}
		>
			{occupied.length === 0 ? (
				<p className="px-2 py-1 text-[12px] text-muted-foreground">
					Nobody is working yet. Pick a room and start an agent in it.
				</p>
			) : null}
			{occupied.map((room) => (
				<section
					key={keyOf(room.place)}
					aria-label={room.name}
					className={cn("flex flex-col rounded-lg", dropRing(room))}
					{...dropOn(room)}
				>
					{roomButton(room)}
					<ul className="flex flex-col">
						{room.people.map((agent) => (
							<li key={agent.terminalId}>
								<TeamRow
									agent={agent}
									line={agentLine(agent, todos, notes)}
									from={isVisiting(agent) ? agent.workspaceName : undefined}
									selected={agent.terminalId === agentId}
									now={now}
									onSelect={() => onSelectAgent(agent.terminalId)}
								/>
							</li>
						))}
					</ul>
				</section>
			))}
			{error ? (
				<p role="alert" className="px-2 text-[11px] text-red-500">
					{error}
				</p>
			) : null}
			{empty.length > 0 ? (
				<section aria-label="Empty rooms" className="flex flex-col">
					<button
						type="button"
						aria-expanded={showEmpty}
						onClick={() => setEmptyToggle({ at: openKey, shown: !showEmpty })}
						className="flex items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
					>
						<Chevron className="size-3.5" />
						Empty rooms
						<span className="font-normal tabular-nums">{empty.length}</span>
					</button>
					{showEmpty ? (
						<ul className="flex flex-col">
							{empty.map((room) => (
								<li
									key={keyOf(room.place)}
									className={cn("rounded-md", dropRing(room))}
									{...dropOn(room)}
								>
									{roomButton(room)}
								</li>
							))}
						</ul>
					) : null}
				</section>
			) : null}
		</nav>
	);
}
