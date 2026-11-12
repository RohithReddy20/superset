import { formatCompactRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import type { KeyboardEvent } from "react";
import { TICK_MS, useNow } from "../../../../../hooks/useNow";
import { useCityTeam } from "../../../../hooks/useCityTeam";
import type { AgentStatus, CityAgent, CityProject } from "../../../../types";
import { MEETING_ROOM } from "../../../../utils/buildingSnapshot";
import { AgentFace } from "../AgentFace";
import { AgentIcon } from "../AgentIcon";
import { ProjectIcon } from "../ProjectIcon";
import { StatusBadge } from "../StatusBadge";
import { GroupHeader } from "./components/GroupHeader";

interface AgentListProps {
	projects: CityProject[];
	/** Every agent in the city, to name the rooms visitors sit in. */
	allProjects: CityProject[];
	selectedId: string | null;
	onSelect: (terminalId: string) => void;
}

/** These come first. The rest keep one order, so a row does not move when its agent starts, finishes or is looked at. */
const URGENT: AgentStatus[] = ["permission", "failed", "lost"];
const urgency = (status: AgentStatus) =>
	URGENT.includes(status) ? URGENT.indexOf(status) : URGENT.length;

const ROW =
	"grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_6.5rem_4.5rem] items-center gap-3 px-4 py-2 text-left text-[13px]";

/** Every agent as a row, grouped by building, the ones that cannot go on without you first. Up and Down move between rows. */
export function AgentList({
	projects,
	allProjects,
	selectedId,
	onSelect,
}: AgentListProps) {
	const placeName = (agent: CityAgent): string | null => {
		const { projectId, roomId } = agent.place;
		if (projectId === agent.projectId && roomId === agent.workspaceId)
			return null;
		const project = allProjects.find((p) => p.id === projectId);
		const room =
			roomId === MEETING_ROOM.id
				? MEETING_ROOM.name
				: project?.workspaces.find((w) => w.id === roomId)?.name;
		return [room, project?.name].filter(Boolean).join(" · ") || null;
	};
	const { todos } = useCityTeam();
	const now = useNow(TICK_MS);
	const doingOf = (terminalId: string) =>
		todos.find((t) => t.ownerId === terminalId && t.state === "doing");
	const onRowKey = (event: KeyboardEvent<HTMLButtonElement>) => {
		const step =
			event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
		if (!step) return;
		const rows = [
			...(event.currentTarget
				.closest("[data-agent-list]")
				?.querySelectorAll<HTMLButtonElement>("button[data-agent-row]") ?? []),
		];
		const next = rows[rows.indexOf(event.currentTarget) + step];
		if (!next) return;
		event.preventDefault();
		next.focus();
		next.click();
	};

	return (
		<div data-agent-list className="h-full overflow-y-auto">
			<div
				className={cn(
					ROW,
					"sticky top-0 z-10 border-b border-border bg-background py-1.5 text-[11px] font-medium text-muted-foreground",
				)}
			>
				<span>Agent</span>
				<span>Works in</span>
				<span>Status</span>
				<span className="text-right">Last change</span>
			</div>
			{projects.map((project) => {
				const agents = project.workspaces
					.flatMap((w) => w.agents)
					.sort(
						(a, b) =>
							urgency(a.status) - urgency(b.status) ||
							a.startedAt - b.startedAt ||
							a.terminalId.localeCompare(b.terminalId),
					);
				return (
					<section key={project.id} aria-label={project.name}>
						<GroupHeader
							icon={<ProjectIcon project={project} className="size-3.5" />}
							name={project.name}
							detail={`${project.workspaces.length} workspace${project.workspaces.length === 1 ? "" : "s"} · ${agents.length} agent${agents.length === 1 ? "" : "s"}`}
						/>
						{agents.length === 0 ? (
							<p className="px-4 py-2.5 text-[12px] text-muted-foreground">
								Nobody here yet. Open this building on the map and pick a CLI in
								the row at the top to start an agent.
							</p>
						) : (
							<ul>
								{agents.map((agent) => {
									const visiting = placeName(agent);
									const doing = doingOf(agent.terminalId);
									const branch = project.workspaces.find(
										(w) => w.id === agent.workspaceId,
									)?.branch;
									const selected = agent.terminalId === selectedId;
									return (
										<li key={agent.terminalId}>
											<button
												type="button"
												data-agent-row
												aria-current={selected ? "true" : undefined}
												onClick={() => onSelect(agent.terminalId)}
												onKeyDown={onRowKey}
												className={cn(
													ROW,
													"border-b border-border/50 transition-colors hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
													selected && "bg-fill-selected hover:bg-fill-selected",
												)}
											>
												<span className="flex min-w-0 items-center gap-2">
													<AgentFace name={agent.name} />
													<span className="truncate font-medium">
														{agent.name}
													</span>
													<AgentIcon
														agentId={agent.agentId}
														className="size-3.5"
													/>
													{agent.handle ? (
														<span className="hidden truncate font-mono text-[11px] text-muted-foreground @[760px]/city:inline">
															@{agent.handle}
														</span>
													) : null}
												</span>
												<span className="min-w-0 text-muted-foreground">
													<span className="block truncate">
														{agent.workspaceName}
														{branch ? (
															<span className="ml-1.5 font-mono text-[11px]">
																{branch}
															</span>
														) : null}
													</span>
													{visiting ? (
														<span className="block truncate text-[11px]">
															sits in {visiting}
														</span>
													) : null}
													{doing ? (
														<span className="block truncate text-[11px] text-foreground">
															<span className="mr-1 rounded bg-amber-500/15 px-1 font-mono text-[10px] text-amber-600 dark:text-amber-400">
																doing
															</span>
															{doing.text}
														</span>
													) : null}
												</span>
												<span className="justify-self-start">
													<StatusBadge status={agent.status} />
												</span>
												<span className="text-right text-[12px] tabular-nums text-muted-foreground">
													{formatCompactRelativeTime(
														agent.lastEventAt,
														Math.max(now, agent.lastEventAt),
													)}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</section>
				);
			})}
		</div>
	);
}
