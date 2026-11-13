import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { LuDoorOpen, LuExternalLink } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { CityAgent, CityProject, CityRoom } from "../../../../../../types";
import { MEETING_ROOM } from "../../../../../../utils/buildingSnapshot";
import { AgentBar } from "../../../AgentBar";
import { AgentIcon } from "../../../AgentIcon";
import { RoomComposer } from "../../../RoomComposer";
import { RoomFeed } from "../../../RoomFeed";
import { StatusBadge } from "../../../StatusBadge";
import { PanelHeader } from "../PanelHeader";

interface RoomDetailsProps {
	project: CityProject;
	roomId: string;
	roomName: string;
	/** Who sits here with their @handles; absent when the room is empty. */
	room: CityRoom | undefined;
	people: CityAgent[];
	draft: string;
	onDraft: (text: string) => void;
	onSelectAgent: (terminalId: string) => void;
	onClose: () => void;
}

/** Who sits in a room, what was written to the room, and one box to write to everyone in it. */
export function RoomDetails({
	project,
	roomId,
	roomName,
	room,
	people,
	draft,
	onDraft,
	onSelectAgent,
	onClose,
}: RoomDetailsProps) {
	const navigate = useNavigate();
	const place = { projectId: project.id, roomId };
	const workspace = project.workspaces.find((w) => w.id === roomId);
	const handleOf = new Map(
		(room?.members ?? []).map((m) => [m.terminalId, m.handle]),
	);
	const empty = people.length === 0;

	return (
		<>
			<PanelHeader
				icon={<LuDoorOpen className="size-4 text-muted-foreground" />}
				title={<span className="truncate text-sm font-medium">{roomName}</span>}
				meta={
					roomId === MEETING_ROOM.id
						? "Anyone in the city can sit here"
						: workspace?.branch
							? `Workspace room · ${workspace.branch}`
							: "Workspace room"
				}
				actions={
					workspace ? (
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Open workspace"
							title="Open this workspace"
							onClick={() => void navigateToV2Workspace(workspace.id, navigate)}
						>
							<LuExternalLink />
						</Button>
					) : null
				}
				onClose={onClose}
			/>
			<div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2.5">
				<h3 className="text-[11px] font-medium text-muted-foreground">
					{empty
						? "Nobody sits here. Drag someone onto this room, or start an agent."
						: `${people.length} sitting here`}
				</h3>
				{empty ? null : (
					<ul className="-mx-1 flex max-h-40 flex-col overflow-y-auto">
						{people.map((agent) => (
							<li key={agent.terminalId}>
								<button
									type="button"
									onClick={() => onSelectAgent(agent.terminalId)}
									className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[13px] transition-colors hover:bg-fill-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<AgentIcon agentId={agent.agentId} />
									<span className="min-w-0 flex-1 truncate">
										{agent.name}
										{handleOf.has(agent.terminalId) ? (
											<span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
												@{handleOf.get(agent.terminalId)}
											</span>
										) : null}
										{agent.workspaceId !== roomId ? (
											<span className="ml-1.5 text-[11px] text-muted-foreground">
												from {agent.workspaceName}
											</span>
										) : null}
									</span>
									<StatusBadge status={agent.status} />
								</button>
							</li>
						))}
					</ul>
				)}
				{workspace ? (
					<AgentBar
						workspaceId={workspace.id}
						projectId={project.id}
						shown={workspace.agents.map((a) => a.terminalId)}
						defaultOpen={workspace.agents.length === 0}
					/>
				) : null}
			</div>
			<RoomFeed place={place} people={people} onSelectAgent={onSelectAgent} />
			<div className="shrink-0 border-t border-border p-2.5">
				<RoomComposer
					place={place}
					room={room}
					people={people}
					draft={draft}
					onDraft={onDraft}
				/>
			</div>
		</>
	);
}
