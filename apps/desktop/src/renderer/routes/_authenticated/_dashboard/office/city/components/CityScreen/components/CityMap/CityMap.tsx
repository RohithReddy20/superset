import { Button } from "@superset/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuMap, LuMinus, LuPlus } from "react-icons/lu";
import type { CityBuildingSource } from "../../../../types";
import { layoutCity } from "../../../../utils/cityLayout";
import { CitySigns, type CitySignsHandle } from "./components/CitySigns";
import type { CityScene, CityView } from "./scene";
import { wallColorFor } from "./scene/art";

interface CityMapProps {
	/** Projects, and the office. */
	projects: CityBuildingSource[];
	onEnter: (projectId: string) => void;
}

export function CityMap({ projects, onEnter }: CityMapProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const signsRef = useRef<CitySignsHandle>(null);
	const sceneRef = useRef<CityScene | null>(null);
	const [view, setView] = useState<CityView | null>(null);
	const onEnterRef = useRef(onEnter);
	onEnterRef.current = onEnter;

	const layout = useMemo(() => layoutCity(projects), [projects]);
	const walls = useMemo(
		() => new Map(projects.map((p) => [p.id, wallColorFor(p)])),
		[projects],
	);
	const latest = useRef({ layout, walls });
	latest.current = { layout, walls };

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		let disposed = false;
		let game: { destroy: (removeCanvas: boolean) => void } | null = null;
		void import("./scene").then(({ createCityGame }) => {
			if (disposed) return;
			game = createCityGame(host, {
				onEnter: (id) => onEnterRef.current(id),
				onFrame: (frame) => signsRef.current?.setFrame(frame),
				onView: setView,
				onReady: (scene) => {
					sceneRef.current = scene;
					scene.setCity(latest.current.layout, latest.current.walls);
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
		sceneRef.current?.setCity(layout, walls);
	}, [layout, walls]);

	return (
		<div className="relative h-full w-full overflow-hidden bg-[#1a2230]">
			<div
				ref={hostRef}
				role="application"
				aria-label="City"
				className="h-full w-full outline-none"
			/>
			<CitySigns ref={signsRef} projects={projects} onEnter={onEnter} />
			{view ? (
				<div className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-border bg-popover/90 p-1 shadow-md backdrop-blur">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Zoom out"
						title="Zoom out"
						disabled={!view.canZoomOut}
						onClick={() => sceneRef.current?.zoomOut()}
					>
						<LuMinus />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Zoom in"
						title="Zoom in"
						disabled={!view.canZoomIn}
						onClick={() => sceneRef.current?.zoomIn()}
					>
						<LuPlus />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5 text-xs"
						onClick={() => sceneRef.current?.showWholeCity()}
					>
						<LuMap className="size-3.5" />
						Whole city
					</Button>
				</div>
			) : null}
			<p className="pointer-events-none absolute bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 rounded-2xl border border-border bg-background/90 px-3 py-1.5 text-center text-[12px] text-muted-foreground shadow-sm backdrop-blur">
				<span className="font-medium text-foreground">Click a building</span> to
				go inside · drag to look around · a lit window is an agent at work
			</p>
		</div>
	);
}
