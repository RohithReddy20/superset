import { useEffect, useMemo, useRef, useState } from "react";
import type { OfficeSnapshot } from "../../types";
import { groupThreads } from "../../utils/groupThreads";
import { layoutWorld } from "../../utils/world";
import { FloorControls } from "./components/FloorControls";
import {
	type AreaLabel,
	FloorOverlay,
	type FloorOverlayHandle,
} from "./components/FloorOverlay";
import { GroupChat } from "./components/GroupChat";
import type { OfficeScene, ScenePayload, SceneView } from "./scene";
import { WORLD_MAP } from "./scene/assets";
import { lookFor, lookKey, renderFace } from "./scene/pixel";

const AREAS: AreaLabel[] = WORLD_MAP.zones.flatMap((zone) =>
	zone.label ? [{ id: zone.id, label: zone.label }] : [],
);

interface OfficeFloorProps {
	state: OfficeSnapshot;
	selectedId: string | null;
	meId: string | null;
	onSelectTeammate: (id: string) => void;
	onSelectRoom: (id: string) => void;
	onMoveTeammates: (ids: string[], roomId: string) => Promise<void>;
	/** Posts as the person; returns the new message id. */
	onSay: (input: {
		roomId: string;
		threadId: string | null;
		text: string;
	}) => Promise<{ id: string }>;
	onOpenThread: (roomId: string, threadId: string) => void;
}

export function OfficeFloor({
	state,
	selectedId,
	meId,
	onSelectTeammate,
	onSelectRoom,
	onMoveTeammates,
	onSay,
	onOpenThread,
}: OfficeFloorProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<FloorOverlayHandle>(null);
	const sceneRef = useRef<OfficeScene | null>(null);
	const latest = useRef<ScenePayload | null>(null);
	const [view, setView] = useState<SceneView | null>(null);
	const [pickedIds, setPickedIds] = useState<string[]>([]);
	const handlers = useRef({ onSelectTeammate, onSelectRoom, onMoveTeammates });
	handlers.current = { onSelectTeammate, onSelectRoom, onMoveTeammates };

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
	const picked = useMemo(
		() =>
			state.teammates.filter(
				(t) => t.kind === "ai" && pickedIds.includes(t.id),
			),
		[state.teammates, pickedIds],
	);
	const threads = useMemo(
		() => groupThreads(state.messages, meId, picked),
		[state.messages, meId, picked],
	);
	const faces = useMemo(
		() =>
			new Map(
				state.teammates.map((t) => {
					const look = lookFor(t.id);
					return [t.id, renderFace(look, lookKey(look))];
				}),
			),
		[state.teammates],
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
				onPick: setPickedIds,
				onMoveTeammates: (ids, roomId) => {
					handlers.current
						.onMoveTeammates(ids, roomId)
						.catch(() => sceneRef.current?.sendHome(ids));
				},
				onFrame: (frame) => overlayRef.current?.setFrame(frame),
				onView: setView,
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
		latest.current = {
			state,
			layout,
			selectedId,
			meId,
			picked: picked.map((t) => t.id),
		};
		sceneRef.current?.setState(latest.current);
	}, [state, layout, selectedId, meId, picked]);

	const sendToGroup = async (text: string) => {
		for (const thread of threads) {
			const mentions = thread.members.map((id) => `@${id}`).join(" ");
			await onSay({
				roomId: thread.roomId,
				threadId: thread.rootId,
				text: thread.rootId ? text : `${mentions} ${text}`,
			});
		}
	};

	return (
		<div className="relative h-full w-full overflow-hidden">
			<div
				ref={hostRef}
				role="application"
				aria-label="Office floor"
				onPointerDown={() => hostRef.current?.focus()}
				onKeyDown={(event) => {
					if (event.key === "Escape") setPickedIds([]);
				}}
				className="h-full w-full outline-none"
			/>
			<FloorOverlay
				ref={overlayRef}
				teammates={state.teammates}
				rooms={layout.rooms}
				areas={AREAS}
				faces={faces}
				selectedId={selectedId}
				picked={picked.map((t) => t.id)}
				meId={meId}
				onClickTeammate={(id, additive) => {
					const ai = state.teammates.find((t) => t.id === id)?.kind === "ai";
					if (ai && additive)
						setPickedIds((ids) =>
							ids.includes(id) ? ids.filter((p) => p !== id) : [...ids, id],
						);
					else {
						onSelectTeammate(id);
						setPickedIds(ai ? [id] : []);
					}
				}}
				onSelectRoom={onSelectRoom}
				onCarryStart={(id) => sceneRef.current?.beginCarry(id)}
				onCarryMove={(x, y) => sceneRef.current?.carryToScreen(x, y)}
				onCarryEnd={() => sceneRef.current?.endCarry()}
			/>
			{picked.length > 0 ? (
				<GroupChat
					group={picked}
					everyone={state.teammates}
					rooms={state.rooms}
					messages={state.messages}
					threads={threads}
					faces={faces}
					onSend={sendToGroup}
					onOpenThread={onOpenThread}
					onClose={() => setPickedIds([])}
				/>
			) : (
				<div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[calc(100%-24px)] -translate-x-1/2 truncate rounded-full border border-border bg-background/90 px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm backdrop-blur">
					<span className="font-medium text-foreground">Double-click</span> to
					walk · drag to look around · click teammates (Shift for more) to chat
					with them · drag them onto a room to move them
				</div>
			)}
			{view ? (
				<FloorControls
					view={view}
					onZoomIn={() => sceneRef.current?.zoomIn()}
					onZoomOut={() => sceneRef.current?.zoomOut()}
					onFollowMe={() => sceneRef.current?.followMe()}
					onShowWholeOffice={() => sceneRef.current?.showWholeOffice()}
				/>
			) : null}
		</div>
	);
}
