import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	LuArrowLeft,
	LuCheck,
	LuChevronRight,
	LuChevronsUpDown,
} from "react-icons/lu";
import { STATUS_COLORS } from "../../../../constants";
import type { AgentStatus, CityAgent, CityProject } from "../../../../types";
import { ProjectIcon } from "../ProjectIcon";

interface CityBreadcrumbProps {
	projects: CityProject[];
	/** The building that is open, or null on the city. */
	inside: CityProject | null;
	/** The agents the screen shows: the building's, or the whole city's. */
	agents: CityAgent[];
	onEnter: (projectId: string | null) => void;
}

const SUMMARY: Array<[AgentStatus, string]> = [
	["permission", "need you"],
	["working", "working"],
	["review", "done"],
	["failed", "failed"],
	["lost", "disconnected"],
];
const WANTS_YOU = new Set<AgentStatus>(["permission", "failed"]);

/** Where you are: the city, or a building in it, with a way back and a way to another building. */
export function CityBreadcrumb({
	projects,
	inside,
	agents,
	onEnter,
}: CityBreadcrumbProps) {
	return (
		<div className="flex min-w-0 items-center gap-1.5 text-sm">
			{inside ? (
				<button
					type="button"
					aria-label="Back to the city"
					title="Back to the city (Esc)"
					onClick={() => onEnter(null)}
					className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<LuArrowLeft className="size-4" />
				</button>
			) : null}
			<button
				type="button"
				onClick={() => onEnter(null)}
				aria-current={inside ? undefined : "page"}
				className={cn(
					"shrink-0 rounded px-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					inside
						? "text-muted-foreground transition-colors hover:text-foreground"
						: "text-foreground",
				)}
			>
				City
			</button>
			{inside ? (
				<>
					<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								title="Go to another building"
								className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium transition-colors hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-fill-hover"
							>
								<ProjectIcon project={inside} />
								<span className="truncate">{inside.name}</span>
								<LuChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-56">
							<DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
								Buildings
							</DropdownMenuLabel>
							{projects.map((project) => {
								const here = project.workspaces.flatMap((w) => w.agents);
								const wantsYou = here.some((a) => WANTS_YOU.has(a.status));
								return (
									<DropdownMenuItem
										key={project.id}
										onSelect={() => onEnter(project.id)}
										className="gap-2 text-[13px]"
									>
										<ProjectIcon project={project} />
										<span className="min-w-0 flex-1 truncate">
											{project.name}
										</span>
										{wantsYou ? (
											<span
												title="Someone here needs you"
												className="size-1.5 rounded-full"
												style={{ background: STATUS_COLORS.permission }}
											/>
										) : null}
										<span className="text-[11px] tabular-nums text-muted-foreground">
											{here.length === 0
												? "empty"
												: plural(here.length, "agent")}
										</span>
										<LuCheck
											className={cn(
												"size-3.5",
												project.id !== inside.id && "invisible",
											)}
										/>
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				</>
			) : null}
			<span className="ml-2 hidden min-w-0 items-center gap-2 truncate text-[12px] text-muted-foreground md:flex">
				{inside
					? plural(inside.workspaces.length, "workspace")
					: plural(projects.length, "building")}{" "}
				· {plural(agents.length, "agent")}
				{SUMMARY.map(([status, label]) => {
					const count = agents.filter((a) => a.status === status).length;
					return count > 0 ? (
						<span key={status} className="flex shrink-0 items-center gap-1">
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
	);
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
