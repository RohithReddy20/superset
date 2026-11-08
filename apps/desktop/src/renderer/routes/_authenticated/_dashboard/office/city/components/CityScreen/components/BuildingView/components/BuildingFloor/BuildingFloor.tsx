import { useEffect, useMemo, useRef, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { FloorControls } from "../../../../../../../components/OfficeFloor/components/FloorControls";
import {
	FloorOverlay,
	type FloorOverlayHandle,
} from "../../../../../../../components/OfficeFloor/components/FloorOverlay";
import type {
	OfficeScene,
	ScenePayload,
	SceneView,
} from "../../../../../../../components/OfficeFloor/scene";
import { WORLD_MAP } from "../../../../../../../components/OfficeFloor/scene/assets";
import {
	lookFor,
	lookKey,
	renderFace,
} from "../../../../../../../components/OfficeFloor/scene/pixel";
import { layoutWorld, type SeatTarget } from "../../../../../../../utils/world";
import { STATUS_COLORS, STATUS_LABELS } from "../../../../../../constants";
import type { CityAgent, CityProject } from "../../../../../../types";
import {
	buildingSnapshot,
	YOU_ID,
} from "../../../../../../utils/buildingSnapshot";
import { BUILDING_CONTROLS } from "./constants";

const AREAS = WORLD_MAP.zones.flatMap((zone) =>
	zone.label ? [{ id: zone.id, label: zone.label }] : [],
);

interface BuildingFloorProps {
	project: CityProject;
	/** Agents sitting in this building, its own and visitors. */
	present: CityAgent[];
	selectedId: string | null;
	/** Agents picked for a group message. */
	picked: string[];
	onPick: (terminalIds: string[]) => void;
	onSelectAgent: (terminalId: string) => void;
	onSelectWorkspace: (workspaceId: string) => void;
	/** Seats agents in a room of this building; rejects when the move is refused. */
	onSeat: (terminalIds: string[], roomId: string) => Promise<void>;
}

/** The office floor with a room per workspace and a person per agent here. Seating someone never changes their workspace. */
export function BuildingFloor({
	project,
	present,
	selectedId,
	picked,
	onPick,
	onSelectAgent,
	onSelectWorkspace,
	onSeat,
}: BuildingFloorProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<FloorOverlayHandle>(null);
	const sceneRef = useRef<OfficeScene | null>(null);
	const latest = useRef<ScenePayload | null>(null);
	const previousHomes = useRef<Map<string, SeatTarget> | undefined>(undefined);
	const [view, setView] = useState<SceneView | null>(null);
	const handlers = useRef({ onSelectAgent, onSelectWorkspace, onPick, onSeat });
	handlers.current = { onSelectAgent, onSelectWorkspace, onPick, onSeat };
	const dark = useIsDarkTheme();

	const snapshot = useMemo(
		() => buildingSnapshot(project, present),
		[project, present],
	);
	const layout = useMemo(
		() =>
			layoutWorld({
				map: WORLD_MAP,
				rooms: snapshot.rooms,
				teammates: snapshot.teammates,
				handoffs: [],
				previous: previousHomes.current,
			}),
		[snapshot],
	);
	useEffect(() => {
		previousHomes.current = layout.homes;
	}, [layout]);

	const agents = present;
	const dots = useMemo(
		() => new Map(agents.map((a) => [a.terminalId, STATUS_COLORS[a.status]])),
		[agents],
	);
	const statusLabels = useMemo(
		() => new Map(agents.map((a) => [a.terminalId, STATUS_LABELS[a.status]])),
		[agents],
	);
	const icons = useMemo(() => {
		const map = new Map<string, string>();
		for (const a of agents) {
			const icon = getPresetIcon(a.agentId, dark);
			if (icon) map.set(a.terminalId, icon);
		}
		return map;
	}, [agents, dark]);
	const faces = useMemo(
		() =>
			new Map(
				snapshot.teammates.map((t) => {
					const look = lookFor(t.id);
					return [t.id, renderFace(look, lookKey(look))];
				}),
			),
		[snapshot.teammates],
	);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		host.tabIndex = 0;
		let disposed = false;
		let game: { destroy: (removeCanvas: boolean) => void } | null = null;
		void import("../../../../../../../components/OfficeFloor/scene").then(
			({ createOfficeGame }) => {
				if (disposed) return;
				game = createOfficeGame(host, {
					onSelectTeammate: (id) => {
						if (id !== YOU_ID) handlers.current.onSelectAgent(id);
					},
					onSelectRoom: (id) => handlers.current.onSelectWorkspace(id),
					onPick: (ids) =>
						handlers.current.onPick(ids.filter((id) => id !== YOU_ID)),
					onMoveTeammates: (ids, roomId) => {
						handlers.current
							.onSeat(ids, roomId)
							.catch(() => sceneRef.current?.sendHome(ids));
					},
					onDropOnEmptyArea: (ids) => sceneRef.current?.sendHome(ids),
					onFrame: (frame) => overlayRef.current?.setFrame(frame),
					onView: setView,
					onReady: (scene) => {
						sceneRef.current = scene;
						if (latest.current) scene.setState(latest.current);
						scene.showEveryone();
					},
				});
			},
		);
		return () => {
			disposed = true;
			sceneRef.current = null;
			game?.destroy(true);
		};
	}, []);

	useEffect(() => {
		latest.current = {
			state: snapshot,
			layout,
			selectedId,
			meId: YOU_ID,
			picked,
			canCarry: true,
			seatOnly: true,
		};
		sceneRef.current?.setState(latest.current);
	}, [snapshot, layout, selectedId, picked]);

	return (
		<div className="relative h-full w-full overflow-hidden">
			<div
				ref={hostRef}
				role="application"
				aria-label={`${project.name} building`}
				onPointerDown={() => hostRef.current?.focus()}
				onKeyDown={(event) => {
					if (event.key === "Escape") onPick([]);
				}}
				className="h-full w-full outline-none"
			/>
			<FloorOverlay
				ref={overlayRef}
				teammates={snapshot.teammates}
				rooms={layout.rooms}
				areas={AREAS}
				faces={faces}
				selectedId={selectedId}
				picked={picked}
				meId={YOU_ID}
				canCarry
				dots={dots}
				icons={icons}
				statusLabels={statusLabels}
				onClickTeammate={(id, additive) => {
					if (id === YOU_ID) return;
					if (additive)
						onPick(
							picked.includes(id)
								? picked.filter((p) => p !== id)
								: [...picked, id],
						);
					else {
						onSelectAgent(id);
						onPick([id]);
					}
				}}
				onSelectRoom={onSelectWorkspace}
				onCarryStart={(id) => sceneRef.current?.beginCarry(id)}
				onCarryMove={(x, y) => sceneRef.current?.carryToScreen(x, y)}
				onCarryEnd={() => sceneRef.current?.endCarry()}
			/>
			<p className="pointer-events-none absolute bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 rounded-2xl border border-border bg-background/90 px-3 py-1.5 text-center text-[12px] text-muted-foreground shadow-sm backdrop-blur">
				<span className="font-medium text-foreground">Click someone</span> to
				talk · drag them into a room to sit together (their work stays put) ·
				click a room's sign for its talk
			</p>
			{view ? (
				<FloorControls
					view={view}
					onZoomIn={() => sceneRef.current?.zoomIn()}
					onZoomOut={() => sceneRef.current?.zoomOut()}
					onFollowMe={() => sceneRef.current?.followMe()}
					onShowWholeOffice={() => sceneRef.current?.showWholeOffice()}
					onShowEveryone={() => sceneRef.current?.showEveryone()}
					wholeLabel="Whole floor"
					help={BUILDING_CONTROLS}
				/>
			) : null}
		</div>
	);
}
