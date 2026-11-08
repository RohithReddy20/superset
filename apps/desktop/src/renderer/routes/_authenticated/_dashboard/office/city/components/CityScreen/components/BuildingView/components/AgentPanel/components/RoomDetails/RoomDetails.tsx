import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { LuExternalLink } from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCityActions } from "../../../../../../../../hooks/useCityActions";
import type {
	CityAgent,
	CityProject,
	CityRoom,
} from "../../../../../../../../types";
import { MEETING_ROOM } from "../../../../../../../../utils/buildingSnapshot";
import { AgentIcon } from "../../../AgentIcon";
import { MessageBox } from "../../../MessageBox";
import { StatusBadge } from "../../../StatusBadge";

interface RoomDetailsProps {
	project: CityProject;
	roomId: string;
	/** The room's talk, absent until someone has sat or spoken here. */
	room: CityRoom | undefined;
	people: CityAgent[];
	maxRelays: number;
	onSelectAgent: (terminalId: string) => void;
}

/** Who sits in a room, what the agents said to each other there, and a message to all of them. */
export function RoomDetails({
	project,
	roomId,
	room,
	people,
	maxRelays,
	onSelectAgent,
}: RoomDetailsProps) {
	const navigate = useNavigate();
	const actions = useCityActions();
	const scrollRef = useRef<HTMLDivElement>(null);
	const place = { projectId: project.id, roomId };
	const workspace = project.workspaces.find((w) => w.id === roomId);
	const handleOf = new Map(
		(room?.members ?? []).map((m) => [m.terminalId, m.handle]),
	);
	const nameOf = (id: string) =>
		id === "you"
			? "You"
			: handleOf.has(id)
				? `@${handleOf.get(id)}`
				: (people.find((p) => p.terminalId === id)?.name ?? "someone who left");
	const messages = room?.messages ?? [];
	const said = messages.length;

	useEffect(() => {
		const node = scrollRef.current;
		if (node && said > 0) node.scrollTop = node.scrollHeight;
	}, [said]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
			<div className="text-[12px] text-muted-foreground">
				{roomId === MEETING_ROOM.id
					? "Anyone in the city can sit here. Agents sitting together can talk by @mentioning each other."
					: workspace?.branch
						? `Workspace room · ${workspace.branch}`
						: "Workspace room"}
			</div>
			<div className="flex flex-col gap-1">
				<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
					{people.length === 0 ? "Nobody sits here" : `${people.length} here`}
				</span>
				{people.map((agent) => (
					<button
						key={agent.terminalId}
						type="button"
						onClick={() => onSelectAgent(agent.terminalId)}
						className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-muted"
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
				))}
			</div>
			<div
				ref={scrollRef}
				className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto rounded-md border border-border bg-muted/40 p-2"
			>
				{messages.length === 0 ? (
					<p className="p-1 text-[12px] text-muted-foreground">
						Nothing said here yet. Agents talk here when one @mentions another.
					</p>
				) : (
					messages.map((m) =>
						m.kind === "system" ? (
							<p
								key={m.id}
								className="text-center text-[11px] italic text-muted-foreground"
							>
								{m.text}
							</p>
						) : (
							<div
								key={m.id}
								className={cn(
									"flex flex-col gap-0.5",
									m.fromId === "you" && "items-end",
								)}
							>
								<span className="font-mono text-[10px] text-muted-foreground">
									{nameOf(m.fromId)} →{" "}
									{m.fromId === "you"
										? "everyone"
										: m.toIds.map(nameOf).join(", ")}
								</span>
								<div
									className={cn(
										"max-w-[92%] whitespace-pre-wrap break-words rounded-lg px-2.5 py-1.5 text-[12px] leading-snug",
										m.fromId === "you"
											? "bg-foreground text-background"
											: "border border-border bg-background text-foreground",
									)}
								>
									{m.text}
								</div>
							</div>
						),
					)
				)}
			</div>
			{room?.paused ? (
				<div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[12px]">
					<span className="min-w-0 flex-1">
						Paused after {maxRelays} messages between agents.
					</span>
					<Button
						size="sm"
						variant="outline"
						className="h-6 px-2 text-[11px]"
						onClick={() => void actions.resume(place)}
					>
						Let them continue
					</Button>
				</div>
			) : null}
			<MessageBox
				placeholder={
					people.length === 0
						? "Seat someone here first"
						: `Message everyone here (${people.length})`
				}
				onSend={async (text) => {
					await actions.say(place, text);
				}}
			/>
			{workspace ? (
				<Button
					variant="outline"
					className="gap-1.5"
					onClick={() => void navigateToV2Workspace(workspace.id, navigate)}
				>
					<LuExternalLink className="size-3.5" />
					Open workspace
				</Button>
			) : null}
		</div>
	);
}
