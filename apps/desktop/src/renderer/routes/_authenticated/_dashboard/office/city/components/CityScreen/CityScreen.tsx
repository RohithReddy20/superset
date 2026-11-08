import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuBuilding2, LuChevronRight } from "react-icons/lu";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { STATUS_COLORS } from "../../constants";
import { useCity } from "../../hooks/useCity";
import type { AgentStatus } from "../../types";
import { BuildingView } from "./components/BuildingView";
import { CityMap } from "./components/CityMap";

interface CityScreenProps {
	projectId: string | null;
}

const SUMMARY: Array<[AgentStatus, string]> = [
	["permission", "need you"],
	["working", "working"],
	["review", "done"],
	["failed", "failed"],
];

export function CityScreen({ projectId }: CityScreenProps) {
	const navigate = useNavigate();
	const { projects, rooms, maxRelays, hostReady, ready } = useCity();
	const inside = projects.find((p) => p.id === projectId) ?? null;
	const shown = inside ? [inside] : projects;
	const agents = shown.flatMap((p) => p.workspaces.flatMap((w) => w.agents));

	const enter = (id: string | null) =>
		navigate({ to: "/office/city", search: id ? { project: id } : {} });

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<PageHeader
				start={
					<div className="flex min-w-0 items-center gap-1.5 text-sm">
						<button
							type="button"
							onClick={() => enter(null)}
							className={cn(
								"font-medium",
								inside
									? "text-muted-foreground hover:text-foreground"
									: "text-foreground",
							)}
						>
							City
						</button>
						{inside ? (
							<>
								<LuChevronRight className="size-3.5 text-muted-foreground" />
								<span className="truncate font-medium">{inside.name}</span>
							</>
						) : null}
						<span className="ml-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
							{inside
								? plural(inside.workspaces.length, "workspace")
								: plural(projects.length, "building")}{" "}
							· {plural(agents.length, "agent")}
							{SUMMARY.map(([status, label]) => {
								const count = agents.filter((a) => a.status === status).length;
								return count > 0 ? (
									<span key={status} className="flex items-center gap-1">
										<span
											className="size-1.5 rounded-full"
											style={{ background: STATUS_COLORS[status] }}
										/>
										{count} {label}
									</span>
								) : null;
							})}
						</span>
					</div>
				}
				end={
					<button
						type="button"
						onClick={() => navigate({ to: "/office" })}
						className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<LuBuilding2 className="size-3.5" />
						office
					</button>
				}
			/>
			<div className="relative min-h-0 flex-1">
				{!hostReady ? (
					<Empty text="Waiting for the local host…" />
				) : !ready && projects.length === 0 ? (
					<Empty text="Building the city…" />
				) : projectId && !inside ? (
					<Empty text="This building is gone: the project has no workspaces on this machine." />
				) : inside ? (
					<BuildingView
						key={inside.id}
						project={inside}
						projects={projects}
						rooms={rooms}
						maxRelays={maxRelays}
					/>
				) : projects.length === 0 ? (
					<Empty text="No projects with a workspace on this machine yet." />
				) : (
					<CityMap projects={projects} onEnter={enter} />
				)}
			</div>
		</div>
	);
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function Empty({ text }: { text: string }) {
	return (
		<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
			{text}
		</div>
	);
}
