import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuUserPlus } from "react-icons/lu";
import type { CityProject } from "../../../../types";
import { AgentBar } from "../AgentBar";

interface AddAgentProps {
	/** The buildings an agent can be started in: the open one, or every one in the city. */
	projects: CityProject[];
}

/** Starts one of the person's CLIs in a workspace they pick. */
export function AddAgent({ projects }: AddAgentProps) {
	const workspaces = projects.flatMap((project) =>
		project.workspaces.map((workspace) => ({ project, workspace })),
	);
	const [picked, setPicked] = useState<string | null>(null);
	const chosen =
		workspaces.find((w) => w.workspace.id === picked) ?? workspaces[0];
	if (!chosen) return null;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button size="sm" className="h-7 gap-1.5 px-2.5 text-[12px]">
					<LuUserPlus className="size-3.5" />
					Add agent
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-80 flex-col gap-2 p-3">
				<label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
					Works in
					<select
						value={chosen.workspace.id}
						onChange={(event) => setPicked(event.target.value)}
						className="h-7 rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
					>
						{projects.map((project) => (
							<optgroup key={project.id} label={project.name}>
								{project.workspaces.map((workspace) => (
									<option key={workspace.id} value={workspace.id}>
										{workspace.name}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</label>
				<AgentBar
					key={chosen.workspace.id}
					workspaceId={chosen.workspace.id}
					projectId={chosen.project.id}
					shown={chosen.workspace.agents.map((a) => a.terminalId)}
					defaultOpen
				/>
			</PopoverContent>
		</Popover>
	);
}
