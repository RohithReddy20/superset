import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { NeedsYouBar } from "../../../components/NeedsYouBar";
import { useCity } from "../../hooks/useCity";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { AgentList } from "./components/AgentList";
import { AgentPanel, type BuildingSelection } from "./components/AgentPanel";
import { BuildingView } from "./components/BuildingView";
import { CityBreadcrumb } from "./components/CityBreadcrumb";
import { CityMap } from "./components/CityMap";
import { EmptyState } from "./components/EmptyState";
import { StartBar } from "./components/StartBar";
import { type CityViewMode, ViewSwitch } from "./components/ViewSwitch";

interface CityScreenProps {
	projectId: string | null;
	/** The agent whose panel is open. */
	agentId: string | null;
	/** The room whose panel is open, when no agent is. */
	roomId: string | null;
	view: CityViewMode;
}

interface CitySearch {
	project?: string;
	agent?: string;
	room?: string;
	view?: "list";
}

export function CityScreen({
	projectId,
	agentId,
	roomId,
	view,
}: CityScreenProps) {
	const navigate = useNavigate();
	const { projects, rooms, handovers, hostReady, ready, agentsReady } =
		useCity();
	const [picked, setPicked] = useState<string[]>([]);
	const inside = projects.find((p) => p.id === projectId) ?? null;
	const shown = inside ? [inside] : projects;
	const agents = shown.flatMap((p) => p.workspaces.flatMap((w) => w.agents));
	const everyone = useMemo(
		() => projects.flatMap((p) => p.workspaces.flatMap((w) => w.agents)),
		[projects],
	);
	const selectedAgent = everyone.find((a) => a.terminalId === agentId);
	const panelProject =
		inside ?? projects.find((p) => p.id === selectedAgent?.projectId) ?? null;
	const selection: BuildingSelection | null = agentId
		? { kind: "agent", id: agentId }
		: roomId && inside
			? { kind: "room", id: roomId }
			: null;
	const panelShown =
		!!selection && !!panelProject && (view === "list" || !!inside);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a pick belongs to one building
	useEffect(() => setPicked([]), [projectId]);

	const here = (): CitySearch => ({
		...(projectId ? { project: projectId } : {}),
		...(view === "list" ? { view: "list" } : {}),
	});
	const enter = (id: string | null) =>
		navigate({
			to: "/office/city",
			search: {
				...(id ? { project: id } : {}),
				...(view === "list" ? { view: "list" as const } : {}),
			},
		});
	const select = (next: BuildingSelection | null) =>
		navigate({
			to: "/office/city",
			replace: true,
			search: {
				...here(),
				...(next?.kind === "agent" ? { agent: next.id } : {}),
				...(next?.kind === "room" ? { room: next.id } : {}),
			},
		});
	const selectAgent = (id: string) => select({ kind: "agent", id });
	const setView = (next: CityViewMode) =>
		navigate({
			to: "/office/city",
			replace: true,
			search: {
				...(projectId ? { project: projectId } : {}),
				...(next === "list" ? { view: "list" as const } : {}),
				...(next === "list" || inside
					? {
							...(agentId ? { agent: agentId } : {}),
							...(!agentId && roomId ? { room: roomId } : {}),
						}
					: {}),
			},
		});

	useEscapeKey(() => {
		if (picked.length > 1) setPicked([]);
		else if (selection) {
			setPicked([]);
			void select(null);
		} else if (projectId) void enter(null);
	});

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<PageHeader
				start={
					<CityBreadcrumb
						projects={projects}
						inside={inside}
						agents={agents}
						onEnter={enter}
					/>
				}
				end={<ViewSwitch view={view} onChange={setView} />}
			/>
			<NeedsYouBar />
			{inside ? <StartBar key={inside.id} project={inside} /> : null}
			<div className="@container/city relative flex min-h-0 flex-1">
				<div className="relative min-w-0 flex-1">
					{!hostReady ? (
						<EmptyState
							busy
							title="Waiting for this machine's host"
							hint="The city shows once the local host answers."
						/>
					) : !ready && projects.length === 0 ? (
						<EmptyState busy title="Building the city" />
					) : projectId && !inside ? (
						<EmptyState
							title="This building is gone"
							hint="The project has no workspaces on this machine any more."
							action={{ label: "Back to the city", onClick: () => enter(null) }}
						/>
					) : view === "list" ? (
						<AgentList
							projects={shown}
							allProjects={projects}
							selectedId={agentId}
							onSelect={selectAgent}
						/>
					) : inside ? (
						<BuildingView
							key={inside.id}
							project={inside}
							everyone={everyone}
							selection={selection}
							ready={agentsReady}
							picked={picked}
							onPick={setPicked}
							onSelect={select}
						/>
					) : projects.length === 0 ? (
						<EmptyState
							title="No buildings yet"
							hint="Every project with a workspace on this machine becomes a building. Create a workspace to see the first one."
						/>
					) : (
						<CityMap projects={projects} onEnter={enter} />
					)}
				</div>
				{panelShown && selection && panelProject ? (
					<AgentPanel
						project={panelProject}
						projects={projects}
						everyone={everyone}
						rooms={rooms}
						handovers={handovers}
						selection={selection}
						onSelectAgent={selectAgent}
						onClose={() => void select(null)}
					/>
				) : null}
			</div>
		</div>
	);
}
