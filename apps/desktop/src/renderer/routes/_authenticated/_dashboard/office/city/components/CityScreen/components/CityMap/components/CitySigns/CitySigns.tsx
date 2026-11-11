import { cn } from "@superset/ui/utils";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { STATUS_COLORS } from "../../../../../../constants";
import type { AgentStatus, CityBuildingSource } from "../../../../../../types";
import { ProjectIcon } from "../../../ProjectIcon";
import type { CityFrame } from "../../scene";

export interface CitySignsHandle {
	setFrame: (frame: CityFrame) => void;
}

interface CitySignsProps {
	projects: CityBuildingSource[];
	onEnter: (id: string) => void;
}

/** Below this zoom a sign shows only the project's name. */
const COMPACT_BELOW = 1;
const SIGN_LIFT = 6;
const SHOWN: AgentStatus[] = [
	"permission",
	"failed",
	"lost",
	"working",
	"review",
];
const SHORT: Record<AgentStatus, string> = {
	idle: "idle",
	permission: "need you",
	failed: "failed",
	working: "working",
	review: "done",
	lost: "disconnected",
};

export const CitySigns = forwardRef<CitySignsHandle, CitySignsProps>(
	function CitySigns({ projects, onEnter }, ref) {
		const rootRef = useRef<HTMLDivElement>(null);
		const nodes = useRef(new Map<string, HTMLDivElement>());

		useImperativeHandle(ref, () => ({
			setFrame(frame) {
				rootRef.current?.setAttribute(
					"data-compact",
					String(frame.zoom < COMPACT_BELOW),
				);
				for (const sign of frame.signs) {
					const node = nodes.current.get(sign.id);
					if (!node) continue;
					node.style.transform = `translate(${Math.round(sign.x)}px, ${Math.round(sign.y - SIGN_LIFT)}px)`;
					node.style.visibility = "visible";
					node.dataset.hovered = String(frame.hovered === sign.id);
				}
			},
		}));

		const bind = useCallback(
			(id: string) => (node: HTMLDivElement | null) => {
				if (node) nodes.current.set(id, node);
				else nodes.current.delete(id);
			},
			[],
		);

		return (
			<div
				ref={rootRef}
				className="group/city pointer-events-none absolute inset-0 overflow-hidden"
			>
				{projects.map((project) => {
					const agents = project.workspaces.flatMap((w) => w.agents);
					const counts = new Map<AgentStatus, number>();
					for (const a of agents)
						counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
					const busy = SHOWN.filter((s) => counts.get(s));
					return (
						<div
							key={project.id}
							ref={bind(project.id)}
							className="group/sign invisible absolute left-0 top-0 will-change-transform"
						>
							<button
								type="button"
								onClick={() => onEnter(project.id)}
								className={cn(
									"pointer-events-auto flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 rounded-lg border border-border bg-popover/95 px-2 py-1 shadow-md backdrop-blur transition-transform hover:scale-[1.04]",
									"group-data-[hovered=true]/sign:scale-[1.04] group-data-[hovered=true]/sign:ring-2 group-data-[hovered=true]/sign:ring-ring",
									"group-data-[compact=true]/city:px-1.5 group-data-[compact=true]/city:py-0.5",
								)}
							>
								<span className="flex items-center gap-1.5 text-[12px] font-medium text-foreground group-data-[compact=true]/city:text-[10px]">
									<ProjectIcon
										project={project}
										className="group-data-[compact=true]/city:size-3"
									/>
									{project.name}
								</span>
								<span className="flex items-center gap-2 text-[11px] text-muted-foreground group-data-[compact=true]/city:hidden">
									{busy.length === 0 ? (
										<span>
											{agents.length === 0
												? "nobody here"
												: `${agents.length} idle`}
										</span>
									) : (
										busy.map((status) => (
											<span key={status} className="flex items-center gap-1">
												<span
													className={cn(
														"size-1.5 rounded-full",
														status === "permission" &&
															"motion-safe:animate-pulse",
													)}
													style={{ background: STATUS_COLORS[status] }}
												/>
												{counts.get(status)} {SHORT[status]}
											</span>
										))
									)}
								</span>
							</button>
						</div>
					);
				})}
			</div>
		);
	},
);
