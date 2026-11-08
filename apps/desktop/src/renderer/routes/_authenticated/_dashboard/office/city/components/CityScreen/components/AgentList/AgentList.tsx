import { formatCompactRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { LuBuilding2 } from "react-icons/lu";
import { EngineMark } from "../../../../../components/EngineMark";
import type { OfficeSnapshot } from "../../../../../types";
import type { AgentStatus, CityAgent, CityProject } from "../../../../types";
import { OFFICE_PLACE } from "../../../../types";
import { MEETING_ROOM } from "../../../../utils/buildingSnapshot";
import { teammateStatus } from "../../../../utils/officeBuilding";
import { AgentIcon } from "../AgentIcon";
import { StatusBadge } from "../StatusBadge";
import { GroupHeader } from "./components/GroupHeader";

interface AgentListProps {
	projects: CityProject[];
	/** Every agent in the city, to name the rooms visitors sit in. */
	allProjects: CityProject[];
	/** The office's teammates and rooms; null leaves the office out. */
	office: Pick<OfficeSnapshot, "teammates" | "rooms"> | null;
	selectedId: string | null;
	onSelect: (terminalId: string) => void;
	onOpenOffice: () => void;
}

const URGENCY: AgentStatus[] = [
	"permission",
	"failed",
	"review",
	"working",
	"idle",
];

const ROW =
	"grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_5.5rem_5rem] items-center gap-3 px-3 py-2 text-left text-[13px]";

/** Every agent as a row, grouped by building, the ones that need you first. */
export function AgentList({
	projects,
	allProjects,
	office,
	selectedId,
	onSelect,
	onOpenOffice,
}: AgentListProps) {
	const placeName = (agent: CityAgent): string | null => {
		const { projectId, roomId } = agent.place;
		if (projectId === agent.projectId && roomId === agent.workspaceId)
			return null;
		if (projectId === OFFICE_PLACE) {
			const room = office?.rooms.find((r) => r.id === roomId);
			return `Office${room ? ` · #${room.name}` : ""}`;
		}
		const project = allProjects.find((p) => p.id === projectId);
		const room =
			roomId === MEETING_ROOM.id
				? MEETING_ROOM.name
				: project?.workspaces.find((w) => w.id === roomId)?.name;
		return [room, project?.name].filter(Boolean).join(" · ") || null;
	};
	const aiTeammates = office?.teammates.filter((t) => t.kind === "ai") ?? [];

	return (
		<div className="h-full overflow-y-auto">
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
			{office ? (
				<section aria-label="Office">
					<GroupHeader
						icon={<LuBuilding2 className="size-3.5 text-muted-foreground" />}
						name="Office"
						detail={`${aiTeammates.length} AI teammate${aiTeammates.length === 1 ? "" : "s"}`}
					/>
					<ul>
						{aiTeammates.map((t) => (
							<li key={t.id}>
								<button
									type="button"
									onClick={onOpenOffice}
									className={cn(ROW, "hover:bg-fill-hover")}
								>
									<span className="flex min-w-0 items-center gap-2">
										<EngineMark engine={t.engine} className="size-4" />
										<span className="truncate font-medium">{t.name}</span>
									</span>
									<span className="min-w-0 truncate text-muted-foreground">
										#
										{office.rooms.find((r) => r.id === t.roomId)?.name ??
											t.roomId}
										{t.line ? ` · ${t.line}` : ""}
									</span>
									<span className="justify-self-start">
										<StatusBadge status={teammateStatus(t)} />
									</span>
									<span className="text-right text-[12px] text-muted-foreground">
										{t.lineSince ? formatCompactRelativeTime(t.lineSince) : ""}
									</span>
								</button>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{projects.map((project) => {
				const agents = project.workspaces
					.flatMap((w) => w.agents)
					.sort(
						(a, b) =>
							URGENCY.indexOf(a.status) - URGENCY.indexOf(b.status) ||
							b.lastEventAt - a.lastEventAt,
					);
				return (
					<section key={project.id} aria-label={project.name}>
						<GroupHeader
							icon={
								project.iconUrl ? (
									<img
										src={project.iconUrl}
										alt=""
										className="size-3.5 rounded-sm object-cover"
									/>
								) : (
									<span className="flex size-3.5 items-center justify-center rounded-sm bg-muted text-[9px] uppercase text-muted-foreground">
										{project.name.slice(0, 1)}
									</span>
								)
							}
							name={project.name}
							detail={`${project.workspaces.length} workspace${project.workspaces.length === 1 ? "" : "s"}`}
						/>
						{agents.length === 0 ? (
							<p className="px-3 py-2 text-[12px] text-muted-foreground">
								No agents running. Open a workspace room on the map to start
								one.
							</p>
						) : (
							<ul>
								{agents.map((agent) => {
									const visiting = placeName(agent);
									const branch = project.workspaces.find(
										(w) => w.id === agent.workspaceId,
									)?.branch;
									return (
										<li key={agent.terminalId}>
											<button
												type="button"
												aria-current={
													agent.terminalId === selectedId ? "true" : undefined
												}
												onClick={() => onSelect(agent.terminalId)}
												className={cn(
													ROW,
													"hover:bg-fill-hover",
													agent.terminalId === selectedId &&
														"bg-fill-selected hover:bg-fill-selected",
												)}
											>
												<span className="flex min-w-0 items-center gap-2">
													<AgentIcon agentId={agent.agentId} />
													<span className="truncate font-medium">
														{agent.name}
													</span>
													{agent.handle ? (
														<span className="truncate font-mono text-[11px] text-muted-foreground">
															@{agent.handle}
														</span>
													) : null}
												</span>
												<span className="min-w-0 truncate text-muted-foreground">
													{agent.workspaceName}
													{branch ? (
														<span className="ml-1.5 font-mono text-[11px]">
															{branch}
														</span>
													) : null}
													{visiting ? (
														<span className="block truncate text-[11px]">
															sitting in {visiting}
														</span>
													) : null}
												</span>
												<span className="justify-self-start">
													<StatusBadge status={agent.status} />
												</span>
												<span className="text-right text-[12px] text-muted-foreground">
													{formatCompactRelativeTime(agent.lastEventAt)}
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
