import { useState } from "react";
import type { CityProject } from "../../../../types";
import { AgentBar } from "../AgentBar";

/**
 * The building's row of CLIs, the same ones as a workspace's own bar: one click starts that CLI
 * in the workspace, and it takes a seat under a new name.
 */
export function StartBar({ project }: { project: CityProject }) {
	const [picked, setPicked] = useState<string | null>(null);
	const workspace =
		project.workspaces.find((w) => w.id === picked) ?? project.workspaces[0];
	if (!workspace) return null;

	return (
		<section
			aria-label="Start an agent"
			className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
		>
			{project.workspaces.length > 1 ? (
				<select
					value={workspace.id}
					aria-label="Workspace to start in"
					onChange={(event) => setPicked(event.target.value)}
					className="h-6 max-w-44 shrink-0 rounded-md border border-input bg-background px-1.5 text-[12px] text-foreground"
				>
					{project.workspaces.map((w) => (
						<option key={w.id} value={w.id}>
							{w.name}
						</option>
					))}
				</select>
			) : (
				<span className="shrink-0 text-[12px] text-muted-foreground">
					{workspace.name}
				</span>
			)}
			<AgentBar
				key={workspace.id}
				workspaceId={workspace.id}
				projectId={project.id}
				shown={workspace.agents.map((a) => a.terminalId)}
				defaultOpen
				inline
			/>
		</section>
	);
}
