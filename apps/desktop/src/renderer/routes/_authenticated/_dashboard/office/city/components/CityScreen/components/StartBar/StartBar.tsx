import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useEffect, useState } from "react";
import type { CityProject } from "../../../../types";
import { AgentBar } from "../AgentBar";

interface StartBarProps {
	project: CityProject;
	/** The workspace of the room or agent that is open; the row starts agents there. */
	openWorkspaceId: string | null;
}

/**
 * The building's row of CLIs, the same ones as a workspace's own bar: one click starts that CLI
 * in the workspace, and it takes a seat under a new name.
 */
export function StartBar({ project, openWorkspaceId }: StartBarProps) {
	const [picked, setPicked] = useState<string | null>(null);
	useEffect(() => {
		if (openWorkspaceId) setPicked(openWorkspaceId);
	}, [openWorkspaceId]);
	const workspace =
		project.workspaces.find((w) => w.id === picked) ?? project.workspaces[0];
	if (!workspace) return null;

	return (
		<section
			aria-label="Start an agent"
			className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-background px-3"
		>
			<span className="shrink-0 text-[12px] text-muted-foreground">
				Start in
			</span>
			{project.workspaces.length > 1 ? (
				<Select value={workspace.id} onValueChange={setPicked}>
					<SelectTrigger
						size="sm"
						aria-label="Workspace to start in"
						className="h-6 max-w-48 shrink-0 gap-1 px-2 py-0 text-[12px] data-[size=sm]:h-6"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{project.workspaces.map((w) => (
							<SelectItem key={w.id} value={w.id} className="text-[13px]">
								{w.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : (
				<span className="shrink-0 truncate text-[12px] font-medium">
					{workspace.name}
				</span>
			)}
			<span className="h-4 w-px shrink-0 bg-border" />
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
