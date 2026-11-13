import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { LuDoorOpen, LuExternalLink } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { CityRoom } from "../../../../../../types";
import type { TeamRoom } from "../../../../../../utils/teamRooms";
import { AgentBar } from "../../../AgentBar";
import { AgentFace } from "../../../AgentFace";
import { RoomComposer } from "../../../RoomComposer";
import { RoomFeed } from "../../../RoomFeed";

const FACES = 6;
const COLUMN = "mx-auto w-full max-w-3xl";

interface RoomConversationProps {
	room: TeamRoom;
	/** Who sits here with their @handles; absent when the room is empty. */
	seats: CityRoom | undefined;
	draft: string;
	onDraft: (text: string) => void;
	onSelectAgent: (terminalId: string) => void;
}

/** A room as a conversation: who is in it, what they said to each other, and one box to write to all of them. */
export function RoomConversation({
	room,
	seats,
	draft,
	onDraft,
	onSelectAgent,
}: RoomConversationProps) {
	const navigate = useNavigate();
	const { workspace, people } = room;
	const where = workspace
		? (workspace.branch ?? "Workspace room")
		: "Anyone in the city can sit here";

	return (
		<section
			aria-label={room.name}
			className="flex h-full min-w-0 flex-1 flex-col"
		>
			<header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-2">
				<LuDoorOpen className="size-4 shrink-0 text-muted-foreground" />
				<div className="flex min-w-0 flex-1 flex-col">
					<h2 className="truncate text-sm font-medium">{room.name}</h2>
					<p className="truncate text-[12px] text-muted-foreground">
						{room.project.name} · {where} ·{" "}
						{people.length === 0
							? "nobody sits here"
							: `${people.length} sitting here`}
					</p>
				</div>
				<ul className="flex shrink-0 -space-x-1.5">
					{people.slice(0, FACES).map((agent) => (
						<li key={agent.terminalId}>
							<button
								type="button"
								title={agent.name}
								aria-label={agent.name}
								onClick={() => onSelectAgent(agent.terminalId)}
								className="block rounded-full ring-2 ring-background transition-transform hover:z-10 hover:scale-110 focus-visible:outline-none focus-visible:ring-ring"
							>
								<AgentFace name={agent.name} className="size-6" />
							</button>
						</li>
					))}
				</ul>
				{people.length > FACES ? (
					<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
						+{people.length - FACES}
					</span>
				) : null}
				{workspace ? (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Open workspace"
						title="Open this workspace"
						onClick={() => void navigateToV2Workspace(workspace.id, navigate)}
					>
						<LuExternalLink />
					</Button>
				) : null}
			</header>
			{workspace ? (
				<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4">
					<span className="shrink-0 text-[12px] text-muted-foreground">
						Start an agent here
					</span>
					<AgentBar
						key={workspace.id}
						workspaceId={workspace.id}
						projectId={room.project.id}
						shown={workspace.agents.map((a) => a.terminalId)}
						defaultOpen
						inline
					/>
				</div>
			) : null}
			<RoomFeed
				place={room.place}
				people={people}
				onSelectAgent={onSelectAgent}
				className={COLUMN}
			/>
			<div className="shrink-0 border-t border-border p-3">
				<div className={COLUMN}>
					<RoomComposer
						place={room.place}
						room={seats}
						people={people}
						draft={draft}
						onDraft={onDraft}
					/>
				</div>
			</div>
		</section>
	);
}
