import { useEffect, useMemo, useRef } from "react";
import type { OfficeSnapshot } from "../../types";
import { layoutWorld } from "../../utils/world";
import {
	FloorOverlay,
	type FloorOverlayHandle,
} from "./components/FloorOverlay";
import type { OfficeScene, ScenePayload } from "./scene";
import { WORLD_MAP } from "./scene/assets";

interface OfficeFloorProps {
	state: OfficeSnapshot;
	selectedId: string | null;
	meId: string | null;
	onSelectTeammate: (id: string) => void;
	onSelectRoom: (id: string) => void;
}

export function OfficeFloor({
	state,
	selectedId,
	meId,
	onSelectTeammate,
	onSelectRoom,
}: OfficeFloorProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<FloorOverlayHandle>(null);
	const sceneRef = useRef<OfficeScene | null>(null);
	const latest = useRef<ScenePayload | null>(null);
	const handlers = useRef({ onSelectTeammate, onSelectRoom });
	handlers.current = { onSelectTeammate, onSelectRoom };

	const layout = useMemo(
		() =>
			layoutWorld({
				map: WORLD_MAP,
				rooms: state.rooms,
				teammates: state.teammates,
				handoffs: state.handoffs,
			}),
		[state.rooms, state.teammates, state.handoffs],
	);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		host.tabIndex = 0;
		let disposed = false;
		let game: { destroy: (removeCanvas: boolean) => void } | null = null;
		void import("./scene").then(({ createOfficeGame }) => {
			if (disposed) return;
			game = createOfficeGame(host, {
				onSelectTeammate: (id) => handlers.current.onSelectTeammate(id),
				onSelectRoom: (id) => handlers.current.onSelectRoom(id),
				onFrame: (frame) => overlayRef.current?.setFrame(frame),
				onReady: (scene) => {
					sceneRef.current = scene;
					if (latest.current) scene.setState(latest.current);
				},
			});
		});
		return () => {
			disposed = true;
			sceneRef.current = null;
			game?.destroy(true);
		};
	}, []);

	useEffect(() => {
		latest.current = { state, layout, selectedId, meId };
		sceneRef.current?.setState(latest.current);
	}, [state, layout, selectedId, meId]);

	return (
		<div className="relative h-full w-full overflow-hidden">
			<div
				ref={hostRef}
				role="application"
				aria-label="Office floor"
				onPointerDown={() => hostRef.current?.focus()}
				className="h-full w-full outline-none"
			/>
			<FloorOverlay
				ref={overlayRef}
				teammates={state.teammates}
				rooms={layout.rooms}
				selectedId={selectedId}
				meId={meId}
				onSelectTeammate={onSelectTeammate}
				onSelectRoom={onSelectRoom}
			/>
		</div>
	);
}
