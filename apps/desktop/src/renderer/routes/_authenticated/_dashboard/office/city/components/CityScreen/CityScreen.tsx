import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuChevronRight, LuList, LuMap } from "react-icons/lu";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { NeedsYouBar } from "../../../components/NeedsYouBar";
import { STATUS_COLORS } from "../../constants";
import { useCity } from "../../hooks/useCity";
import type { AgentStatus } from "../../types";
import { AddAgent } from "./components/AddAgent";
import { AgentList } from "./components/AgentList";
import { AgentPanel } from "./components/AgentPanel";
import { BuildingView } from "./components/BuildingView";
import { CityMap } from "./components/CityMap";
import { EmptyState } from "./components/EmptyState";

export type CityViewMode = "map" | "list";

interface CityScreenProps {
	projectId: string | null;
	/** An agent to open, e.g. from the "Needs you" bar. */
	agentId: string | null;
	view: CityViewMode;
}

const SUMMARY: Array<[AgentStatus, string]> = [
	["permission", "need you"],
	["working", "working"],
	["review", "done"],
	["failed", "failed"],
	["lost", "disconnected"],
];

export function CityScreen({ projectId, agentId, view }: CityScreenProps) {
	const navigate = useNavigate();
	const { projects, rooms, handovers, hostReady, ready } = useCity();
	const [listSelected, setListSelected] = useState<string | null>(null);
	const inside = projects.find((p) => p.id === projectId) ?? null;
	const shown = inside ? [inside] : projects;
	const agents = shown.flatMap((p) => p.workspaces.flatMap((w) => w.agents));
	const everyone = useMemo(
		() => projects.flatMap((p) => p.workspaces.flatMap((w) => w.agents)),
		[projects],
	);
	const buildings = projects;
	const listAgent = everyone.find((a) => a.terminalId === listSelected);
	const listProject = projects.find((p) => p.id === listAgent?.projectId);

	const go = (search: { project?: string; agent?: string; view?: "list" }) =>
		navigate({ to: "/office/city", search });
	const enter = (id: string | null) => go({ ...(id ? { project: id } : {}) });
	const setView = (next: CityViewMode) =>
		go({
			...(projectId ? { project: projectId } : {}),
			...(next === "list" ? { view: "list" } : {}),
		});

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
						<span className="ml-2 flex items-center gap-2 text-[12px] text-muted-foreground">
							{inside
								? plural(inside.workspaces.length, "workspace")
								: plural(buildings.length, "building")}{" "}
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
					<div className="flex items-center gap-2">
						<AddAgent projects={shown} />
						<fieldset
							aria-label="Show as"
							className="flex items-center rounded-md border border-border p-0.5"
						>
							{(
								[
									["map", "Map", LuMap],
									["list", "List", LuList],
								] as const
							).map(([mode, label, Icon]) => (
								<button
									key={mode}
									type="button"
									aria-pressed={view === mode}
									onClick={() => setView(mode)}
									className={cn(
										"flex items-center gap-1.5 rounded px-2 py-0.5 text-[12px]",
										view === mode
											? "bg-fill-selected text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<Icon className="size-3.5" />
									{label}
								</button>
							))}
						</fieldset>
					</div>
				}
			/>
			<NeedsYouBar />
			<div className="relative min-h-0 flex-1">
				{!hostReady ? (
					<EmptyState text="Waiting for the local host…" />
				) : !ready && projects.length === 0 ? (
					<EmptyState text="Building the city…" />
				) : projectId && !inside ? (
					<EmptyState text="This building is gone: the project has no workspaces on this machine." />
				) : view === "list" ? (
					<div className="flex h-full w-full">
						<div className="min-w-0 flex-1">
							<AgentList
								projects={shown}
								allProjects={projects}
								selectedId={listAgent ? listSelected : null}
								onSelect={setListSelected}
							/>
						</div>
						{listAgent && listProject ? (
							<AgentPanel
								project={listProject}
								projects={projects}
								everyone={everyone}
								rooms={rooms}
								handovers={handovers}
								selection={{ kind: "agent", id: listAgent.terminalId }}
								onSelectAgent={setListSelected}
								onClose={() => setListSelected(null)}
							/>
						) : null}
					</div>
				) : inside ? (
					<BuildingView
						key={inside.id}
						project={inside}
						projects={projects}
						rooms={rooms}
						handovers={handovers}
						focusAgentId={agentId}
						onFocused={() => go({ project: inside.id })}
					/>
				) : buildings.length === 0 ? (
					<EmptyState text="No projects with a workspace on this machine yet." />
				) : (
					<CityMap projects={buildings} onEnter={enter} />
				)}
			</div>
		</div>
	);
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
