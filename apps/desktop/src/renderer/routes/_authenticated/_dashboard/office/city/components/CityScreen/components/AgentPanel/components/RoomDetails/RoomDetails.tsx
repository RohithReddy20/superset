import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
	LuDoorOpen,
	LuExternalLink,
	LuGavel,
	LuMessageSquare,
} from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { LongText } from "../../../../../../../components/LongText";
import { useCityTeam } from "../../../../../../hooks/useCityTeam";
import {
	type CityAgent,
	type CityProject,
	type CityRoom,
	YOU,
} from "../../../../../../types";
import { MEETING_ROOM } from "../../../../../../utils/buildingSnapshot";
import { roomTalk } from "../../../../../../utils/roomTalk";
import { AgentBar } from "../../../AgentBar";
import { AgentIcon } from "../../../AgentIcon";
import { MessageBox } from "../../../MessageBox";
import { ModeSwitch } from "../../../ModeSwitch";
import { StatusBadge } from "../../../StatusBadge";
import { PanelHeader } from "../PanelHeader";
import { DecideBox } from "./components/DecideBox";

type Mode = "message" | "decision";

const MODES = [
	{
		id: "message",
		label: "Message",
		icon: LuMessageSquare,
		title: "Write to everyone sitting here",
	},
	{
		id: "decision",
		label: "Decision",
		icon: LuGavel,
		title: "Write down what was decided, and who took what",
	},
] as const;

const RECEIPT_MS = 5000;

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
	const { notes, todos, sayToRoom } = useCityTeam();
	const scrollRef = useRef<HTMLDivElement>(null);
	const [mode, setMode] = useState<Mode>("message");
	const [receipt, setReceipt] = useState<string | null>(null);
	const place = { projectId: project.id, roomId };
	const workspace = project.workspaces.find((w) => w.id === roomId);
	const handleOf = new Map(
		(room?.members ?? []).map((m) => [m.terminalId, m.handle]),
	);
	const nameOf = new Map(people.map((p) => [p.terminalId, p.name]));
	const messages = roomTalk(notes, place, new Set(nameOf.keys()));
	const toWhom = (ids: string[]) =>
		ids
			.map((id) => (id === YOU ? "you" : (nameOf.get(id) ?? "someone")))
			.join(", ");
	const said = messages.length;
	const empty = people.length === 0;

	useEffect(() => {
		const node = scrollRef.current;
		if (node && said > 0) node.scrollTop = node.scrollHeight;
	}, [said]);
	useEffect(() => {
		if (!receipt) return;
		const timer = setTimeout(() => setReceipt(null), RECEIPT_MS);
		return () => clearTimeout(timer);
	}, [receipt]);

	const switcher = (
		<ModeSwitch
			label="What to write"
			modes={MODES}
			value={mode}
			onChange={setMode}
		/>
	);

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
			<div
				ref={scrollRef}
				className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-muted/30 p-3"
			>
				{messages.length === 0 ? (
					<p className="text-[12px] text-muted-foreground">
						Nothing said in this room yet. What you and the agents sitting here
						write to the room or to each other, and what you decide, shows here.
					</p>
				) : (
					messages.map((m) => (
						<div
							key={m.id}
							className={cn(
								"flex flex-col gap-0.5",
								m.fromId === YOU && "items-end",
							)}
						>
							<span className="text-[10px] text-muted-foreground">
								{m.fromId === YOU ? "You" : m.fromName}
								{m.decision
									? " wrote down a decision"
									: m.room
										? " → everyone here"
										: `${m.expectsReply ? " asked " : " → "}${toWhom(m.toIds)}`}
							</span>
							<LongText
								text={
									m.decision && m.decision.todoIds.length > 0
										? `${m.text}\n\n${m.decision.todoIds
												.map((id) => todos.find((t) => t.id === id))
												.flatMap((t) =>
													t
														? [
																`${t.ownerId === YOU ? "You" : t.ownerName} took ${t.id}: ${t.text}`,
															]
														: [],
												)
												.join("\n")}`
										: m.text
								}
								className={cn(
									"w-fit max-w-[92%] rounded-lg px-2.5 py-1.5 text-[12px] leading-snug",
									m.decision
										? "border border-amber-500/40 bg-amber-500/10 text-foreground"
										: m.fromId === YOU
											? "bg-foreground text-background [&_button]:text-background/70"
											: "border border-border bg-background text-foreground",
								)}
							/>
						</div>
					))
				)}
			</div>
			<div className="flex shrink-0 flex-col gap-1.5 border-t border-border p-2.5">
				{receipt ? (
					<output className="text-[11px] text-muted-foreground motion-safe:animate-in motion-safe:fade-in">
						{receipt}
					</output>
				) : null}
				{mode === "decision" && !empty ? (
					<>
						{switcher}
						<DecideBox
							place={place}
							people={people}
							handleOf={handleOf}
							onDone={(text) => {
								setReceipt(text);
								setMode("message");
							}}
						/>
					</>
				) : (
					<MessageBox
						disabled={empty}
						draft={draft}
						onDraft={onDraft}
						placeholder={
							empty
								? "Nobody sits here yet, so there is nobody to write to."
								: `Message everyone here (${people.length})`
						}
						onSend={async (text) => {
							const { waiting } = await sayToRoom(place, text);
							return waiting.length > 0
								? `Sent. ${waiting.join(", ")} get it when back.`
								: `Sent to ${people.length}`;
						}}
						tools={empty ? null : switcher}
					/>
				)}
			</div>
		</>
	);
}
