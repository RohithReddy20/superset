import { useMemo } from "react";
import type { OfficeSnapshot, Teammate } from "../../types";
import {
	box,
	depth,
	rhombus,
	TILE_H,
	TILE_W,
	type Tile,
	toScreen,
} from "../../utils/iso";
import { layoutFloor } from "../../utils/layout";
import { ENGINE_COLORS, engineLabel } from "./constants";

interface OfficeFloorProps {
	state: OfficeSnapshot;
	selectedId: string | null;
	onSelectTeammate: (id: string) => void;
	onSelectRoom: (id: string) => void;
}

const PAD = 48;

export function OfficeFloor({
	state,
	selectedId,
	onSelectTeammate,
	onSelectRoom,
}: OfficeFloorProps) {
	const layout = useMemo(
		() =>
			layoutFloor({
				rooms: state.rooms,
				teammates: state.teammates,
				handoffs: state.handoffs,
			}),
		[state.rooms, state.teammates, state.handoffs],
	);
	const byId = useMemo(
		() => new Map(state.teammates.map((t) => [t.id, t])),
		[state.teammates],
	);

	const corners = [
		toScreen({ x: 0, y: 0 }),
		toScreen({ x: layout.w, y: 0 }),
		toScreen({ x: layout.w, y: layout.h + 1 }),
		toScreen({ x: 0, y: layout.h + 1 }),
	];
	const minX = Math.min(...corners.map((c) => c.x)) - PAD;
	const maxX = Math.max(...corners.map((c) => c.x)) + PAD;
	const minY = Math.min(...corners.map((c) => c.y)) - PAD - 40;
	const maxY = Math.max(...corners.map((c) => c.y)) + PAD;

	const gridLines: string[] = [];
	for (let x = 0; x <= layout.w + 1; x++) {
		const a = toScreen({ x, y: 0 });
		const b = toScreen({ x, y: layout.h + 1 });
		gridLines.push(`M${a.x},${a.y} L${b.x},${b.y}`);
	}
	for (let y = 0; y <= layout.h + 1; y++) {
		const a = toScreen({ x: 0, y });
		const b = toScreen({ x: layout.w + 1, y });
		gridLines.push(`M${a.x},${a.y} L${b.x},${b.y}`);
	}

	const actors = state.teammates
		.map((t) => ({ teammate: t, at: layout.positions.get(t.id) }))
		.filter((a): a is { teammate: Teammate; at: Tile } => !!a.at)
		.sort((a, b) => depth(a.at) - depth(b.at));

	const openHandoffs = state.handoffs.filter((h) => h.status === "working");

	return (
		<svg
			viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
			className="h-full w-full select-none"
			role="img"
			aria-label="Office floor"
		>
			<title>Office floor</title>
			<defs>
				<filter id="office-glow" x="-50%" y="-50%" width="200%" height="200%">
					<feGaussianBlur stdDeviation="6" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>

			<path
				d={gridLines.join(" ")}
				className="stroke-foreground/[0.06]"
				fill="none"
				strokeWidth={1}
			/>

			{layout.rooms.map(({ room, origin, w, h, label }) => {
				const walls = box(origin, w, h, 26);
				const lp = toScreen(label);
				return (
					// biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a <button>
					<g
						key={room.id}
						className="cursor-pointer"
						role="button"
						tabIndex={0}
						aria-label={room.name}
						onClick={() => onSelectRoom(room.id)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") onSelectRoom(room.id);
						}}
					>
						<polygon
							points={rhombus(origin, w, h)}
							className="fill-foreground/[0.035] stroke-foreground/25"
							strokeWidth={1.2}
						/>
						<polygon
							points={walls.left}
							className="fill-foreground/[0.02] stroke-foreground/15"
							strokeWidth={1}
						/>
						<polygon
							points={walls.right}
							className="fill-foreground/[0.02] stroke-foreground/15"
							strokeWidth={1}
						/>
						<g transform={`translate(${lp.x - 4}, ${lp.y - 36})`}>
							<rect
								x={0}
								y={-11}
								rx={2}
								height={16}
								width={room.name.length * 7.2 + 14}
								className="fill-background stroke-foreground/40"
								strokeWidth={1}
							/>
							<text
								x={7}
								y={1}
								className="fill-foreground font-mono text-[10px] uppercase tracking-[0.12em]"
							>
								{room.name}
							</text>
						</g>
					</g>
				);
			})}

			{(() => {
				const m = layout.meeting;
				const walls = box(m.origin, m.w, m.h, 26);
				const center = toScreen({
					x: m.origin.x + m.w / 2,
					y: m.origin.y + m.h / 2,
				});
				const lp = toScreen({ x: m.origin.x, y: m.origin.y - 0.6 });
				return (
					<g>
						<polygon
							points={rhombus(m.origin, m.w, m.h)}
							className="fill-foreground/[0.035] stroke-foreground/25"
							strokeWidth={1.2}
						/>
						<polygon
							points={walls.left}
							className="fill-foreground/[0.02] stroke-foreground/15"
							strokeWidth={1}
						/>
						<polygon
							points={walls.right}
							className="fill-foreground/[0.02] stroke-foreground/15"
							strokeWidth={1}
						/>
						<ellipse
							cx={center.x}
							cy={center.y - 10}
							rx={TILE_W * 0.9}
							ry={TILE_H * 0.9}
							className="fill-background stroke-foreground/40"
							strokeWidth={1.2}
						/>
						<ellipse
							cx={center.x}
							cy={center.y}
							rx={TILE_W * 0.9}
							ry={TILE_H * 0.9}
							className="fill-none stroke-foreground/20"
							strokeWidth={1}
						/>
						<g transform={`translate(${lp.x - 4}, ${lp.y - 36})`}>
							<rect
								x={0}
								y={-11}
								rx={2}
								height={16}
								width={"huddle".length * 7.2 + 14}
								className="fill-background stroke-foreground/40"
								strokeWidth={1}
							/>
							<text
								x={7}
								y={1}
								className="fill-foreground font-mono text-[10px] uppercase tracking-[0.12em]"
							>
								huddle
							</text>
						</g>
					</g>
				);
			})()}

			{layout.desks
				.slice()
				.sort((a, b) => depth(a.desk) - depth(b.desk))
				.map((spot) => {
					const t = byId.get(spot.teammateId);
					const faces = box(spot.desk, 1.4, 0.7, 14);
					const screen = toScreen({
						x: spot.desk.x + 0.7,
						y: spot.desk.y + 0.2,
					});
					const working = t?.presence === "focused";
					const color = t
						? ENGINE_COLORS[t.engine ?? "human"]
						: ENGINE_COLORS.human;
					return (
						<g key={spot.teammateId}>
							<polygon
								points={faces.left}
								className="fill-background stroke-foreground/35"
								strokeWidth={1}
							/>
							<polygon
								points={faces.right}
								className="fill-background stroke-foreground/35"
								strokeWidth={1}
							/>
							<polygon
								points={faces.top}
								className="fill-foreground/[0.08] stroke-foreground/45"
								strokeWidth={1}
							/>
							<g transform={`translate(${screen.x}, ${screen.y - 14})`}>
								<polygon
									points="-9,-10 9,-16 9,-2 -9,4"
									fill={working ? color : "transparent"}
									fillOpacity={working ? 0.85 : 1}
									className="stroke-foreground/50"
									strokeWidth={1}
									filter={working ? "url(#office-glow)" : undefined}
								/>
							</g>
						</g>
					);
				})}

			{openHandoffs.map((h) => {
				const from = layout.positions.get(h.fromId);
				const to = layout.positions.get(h.toId);
				if (!from || !to) return null;
				const a = toScreen(from);
				const b = toScreen(to);
				const color = ENGINE_COLORS[byId.get(h.fromId)?.engine ?? "human"];
				return (
					<g key={h.id}>
						<line
							x1={a.x}
							y1={a.y - 18}
							x2={b.x}
							y2={b.y - 18}
							stroke={color}
							strokeWidth={1.2}
							strokeDasharray="4 5"
							className="office-dash"
							opacity={0.8}
						/>
						<circle r={2.5} fill={color}>
							<animateMotion
								dur="1.6s"
								repeatCount="indefinite"
								path={`M${a.x},${a.y - 18} L${b.x},${b.y - 18}`}
							/>
						</circle>
					</g>
				);
			})}

			{actors.map(({ teammate: t, at }) => {
				const p = toScreen(at);
				const color = ENGINE_COLORS[t.engine ?? "human"];
				const selected = selectedId === t.id;
				const away = t.presence === "away";
				const label = `${t.name}${t.kind === "ai" ? ` · ${engineLabel(t.engine)}` : ""}`;
				const width = label.length * 6.4 + 22;
				return (
					// biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a <button>
					<g
						key={t.id}
						className="cursor-pointer transition-transform duration-700 ease-in-out"
						role="button"
						tabIndex={0}
						aria-label={t.name}
						style={{
							transform: `translate(${p.x}px, ${p.y}px)`,
							opacity: away ? 0.45 : 1,
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") onSelectTeammate(t.id);
						}}
						onClick={(e) => {
							e.stopPropagation();
							onSelectTeammate(t.id);
						}}
					>
						<ellipse
							cx={0}
							cy={2}
							rx={11}
							ry={5}
							className="fill-foreground/15"
						/>
						<path
							d="M-7,0 C-7,-10 -4,-16 0,-16 C4,-16 7,-10 7,0 Z"
							className="fill-background"
							stroke={color}
							strokeWidth={selected ? 2 : 1.3}
						/>
						<circle
							cx={0}
							cy={-22}
							r={6}
							className="fill-background"
							stroke={color}
							strokeWidth={selected ? 2 : 1.3}
						/>
						{t.paused ? (
							<line
								x1={-8}
								y1={-30}
								x2={8}
								y2={-14}
								stroke={color}
								strokeWidth={1.5}
							/>
						) : null}
						<g transform={`translate(${-width / 2}, -48)`}>
							<rect
								x={0}
								y={-11}
								rx={8}
								width={width}
								height={17}
								className={selected ? "fill-foreground" : "fill-background"}
								stroke={color}
								strokeWidth={1}
							/>
							<circle
								cx={10}
								cy={-2.5}
								r={3}
								fill={
									t.presence === "focused"
										? color
										: t.presence === "away"
											? "transparent"
											: color
								}
								fillOpacity={t.presence === "focused" ? 1 : 0.45}
								stroke={color}
								strokeWidth={1}
							/>
							<text
								x={17}
								y={1}
								className={`${selected ? "fill-background" : "fill-foreground"} font-mono text-[10px] tracking-[0.04em]`}
							>
								{label}
							</text>
						</g>
					</g>
				);
			})}
		</svg>
	);
}
