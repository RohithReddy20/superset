import { useEffect, useMemo, useRef, useState } from "react";
import type { OfficeSnapshot } from "../../types";
import { groupRoomFor } from "../../utils/groupRoomFor";
import { roomIdFor } from "../../utils/roomIdFor";
import {
	layoutWorld,
	type Point,
	type SeatHint,
	type SeatTarget,
} from "../../utils/world";
import { FloorControls } from "./components/FloorControls";
import {
	type AreaLabel,
	FloorOverlay,
	type FloorOverlayHandle,
} from "./components/FloorOverlay";
import { GroupChat } from "./components/GroupChat";
import { NewRoomPrompt } from "./components/NewRoomPrompt";
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
	onCreateRoom: (input: {
		id: string;
		name: string;
		place: string;
	}) => Promise<void>;
	/** Posts as the person; returns the new message id. */
	onSay: (input: {
		roomId: string;
		threadId: string | null;
		text: string;
	}) => Promise<{ id: string }>;
	/** The person's private chat with these teammates, made when it does not exist yet. */
	onOpenGroup: (memberIds: string[]) => Promise<{ roomId: string }>;
}

export function OfficeFloor({
	state,
	selectedId,
	meId,
	onSelectTeammate,
	onSelectRoom,
	onMoveTeammates,
	onCreateRoom,
	onSay,
	onOpenGroup,
}: OfficeFloorProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<FloorOverlayHandle>(null);
	const sceneRef = useRef<OfficeScene | null>(null);
	const latest = useRef<ScenePayload | null>(null);
	const [view, setView] = useState<SceneView | null>(null);
	const [pickedIds, setPickedIds] = useState<string[]>([]);
	const [newRoom, setNewRoom] = useState<{
		ids: string[];
		zoneId: string;
		at: Map<string, Point>;
	} | null>(null);
	const previousHomes = useRef<Map<string, SeatTarget> | undefined>(undefined);
	const seatHints = useRef(new Map<string, SeatHint>());
	const hintMoves = (roomId: string, at: Map<string, Point>) => {
		for (const [id, near] of at) seatHints.current.set(id, { roomId, near });
	};
	const handlers = useRef({
		onSelectTeammate,
		onSelectRoom,
		onMoveTeammates,
		hintMoves,
	});
	handlers.current = {
		onSelectTeammate,
		onSelectRoom,
		onMoveTeammates,
		hintMoves,
	};

	const layout = useMemo(
		() =>
			layoutWorld({
				map: WORLD_MAP,
				rooms: state.rooms,
				teammates: state.teammates,
				handoffs: state.handoffs,
				previous: previousHomes.current,
				hints: seatHints.current,
			}),
		[state.rooms, state.teammates, state.handoffs],
	);

	useEffect(() => {
		previousHomes.current = layout.homes;
		for (const [id, hint] of seatHints.current)
			if (state.teammates.some((t) => t.id === id && t.roomId === hint.roomId))
				seatHints.current.delete(id);
	}, [layout, state.teammates]);
	const picked = useMemo(
		() =>
			state.teammates.filter(
				(t) => t.kind === "ai" && pickedIds.includes(t.id),
			),
		[state.teammates, pickedIds],
	);
	const chat = useMemo(
		() =>
			groupRoomFor(
				state.rooms,
				meId,
				picked.map((t) => t.id),
			),
		[state.rooms, meId, picked],
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
				onMoveTeammates: (ids, roomId, at) => {
					handlers.current.hintMoves(roomId, at);
					handlers.current
						.onMoveTeammates(ids, roomId)
						.catch(() => sceneRef.current?.sendHome(ids));
				},
				onDropOnEmptyArea: (ids, zoneId, at) => setNewRoom({ ids, zoneId, at }),
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
		const roomId =
			chat?.id ?? (await onOpenGroup(picked.map((t) => t.id))).roomId;
		await onSay({ roomId, threadId: null, text });
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
					chat={chat}
					messages={state.messages}
					faces={faces}
					onSend={sendToGroup}
					onClose={() => setPickedIds([])}
				/>
			) : (
				<div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[calc(100%-24px)] -translate-x-1/2 truncate rounded-full border border-border bg-background/90 px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm backdrop-blur">
					<span className="font-medium text-foreground">Double-click</span> to
					walk · drag to look around · click teammates (Shift for more) to chat
					with them · drag them onto a room to move them
				</div>
			)}
			{newRoom ? (
				<NewRoomPrompt
					count={newRoom.ids.length}
					onCreate={async (name) => {
						const id = roomIdFor(
							name,
							state.rooms.map((r) => r.id),
						);
						await onCreateRoom({ id, name, place: newRoom.zoneId });
						hintMoves(id, newRoom.at);
						await onMoveTeammates(newRoom.ids, id);
						setNewRoom(null);
					}}
					onCancel={() => {
						sceneRef.current?.sendHome(newRoom.ids);
						setNewRoom(null);
					}}
				/>
			) : null}
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
