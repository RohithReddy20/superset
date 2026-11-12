import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { Button } from "@superset/ui/button";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight, LuLoaderCircle } from "react-icons/lu";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { findLinkedAgent } from "renderer/lib/agent-launch-command";
import { resolveV2PresetIconKey } from "renderer/lib/preset-icon-key";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { filterMatchingPresetsForProject } from "shared/preset-project-targeting";
import { useCity } from "../../../../hooks/useCity";
import { useCityActions } from "../../../../hooks/useCityActions";
import { StartChoice, type StartRequest } from "./components/StartChoice";

const SLOW_START_MS = 20_000;

interface Starting {
	terminalId: string;
	label: string;
	since: number;
}

interface AgentBarProps {
	workspaceId: string;
	projectId: string;
	/** Terminals of the agents the city already shows for this workspace. */
	shown: string[];
	/** Open shows every CLI; closed is one line to open it. */
	defaultOpen: boolean;
	/** One row of CLIs, like a workspace's own bar. */
	inline?: boolean;
}

/**
 * The CLIs of the workspace's own agent bar (every enabled one when no preset links to an agent);
 * a click opens a box that starts one in the workspace's folder.
 */
export function AgentBar({
	workspaceId,
	projectId,
	shown,
	defaultOpen,
	inline = false,
}: AgentBarProps) {
	const [open, setOpen] = useState(defaultOpen);
	const navigate = useNavigate();
	const actions = useCityActions();
	const { activeHostUrl } = useLocalHostService();
	const { data: configs = [] } = useV2AgentConfigs(activeHostUrl);
	const collections = useCollections();
	const { data: presets = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2TerminalPresets: collections.v2TerminalPresets })
				.orderBy(({ v2TerminalPresets }) => v2TerminalPresets.tabOrder),
		[collections],
	);
	const choices = useMemo(() => {
		const inBar = filterMatchingPresetsForProject(presets, projectId).flatMap(
			(preset) => {
				const agent =
					preset.pinnedToBar === false
						? null
						: findLinkedAgent(configs, preset.agentId);
				return agent
					? [{ key: preset.id, label: preset.name || agent.label, agent }]
					: [];
			},
		);
		return inBar.length > 0
			? inBar
			: configs.map((agent) => ({ key: agent.id, label: agent.label, agent }));
	}, [presets, projectId, configs]);
	const { nextName } = useCity();
	const [starting, setStarting] = useState<Starting[]>([]);
	const [now, setNow] = useState(Date.now());

	const shownKey = shown.join(",");
	useEffect(() => {
		const arrived = new Set(shownKey.split(","));
		setStarting((list) =>
			list.some((s) => arrived.has(s.terminalId))
				? list.filter((s) => !arrived.has(s.terminalId))
				: list,
		);
	}, [shownKey]);
	const waiting = starting;
	const anyWaiting = waiting.length > 0;
	useEffect(() => {
		if (!anyWaiting) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [anyWaiting]);

	const start = async (agent: string, label: string, request: StartRequest) => {
		const result = await actions.startAgent({ workspaceId, agent, ...request });
		setStarting((list) => [
			...list,
			{
				terminalId: result.terminalId,
				label: `${result.name} (${label})`,
				since: Date.now(),
			},
		]);
	};

	if (choices.length === 0) return null;
	const buttons = choices.map(({ key, label, agent }) => (
		<StartChoice
			key={key}
			label={label}
			iconId={
				resolveV2PresetIconKey({ agentId: agent.id }, configs) ?? agent.presetId
			}
			launchPresetId={resolveAgentLaunchPresetId(agent.presetId, agent.command)}
			nextName={nextName}
			compact={!inline}
			onStart={(request) => start(agent.id, label, request)}
		/>
	));
	if (inline)
		return (
			<div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none]">
				{buttons}
				{waiting.map((s) => (
					<output
						key={s.terminalId}
						className="flex shrink-0 items-center gap-1.5 px-2 text-[11px] text-muted-foreground motion-safe:animate-in motion-safe:fade-in"
					>
						<LuLoaderCircle className="size-3 motion-safe:animate-spin" />
						{now - s.since < SLOW_START_MS
							? `Starting ${s.label}…`
							: `${s.label} is starting in its terminal; it shows up here when its CLI is ready`}
					</output>
				))}
			</div>
		);
	const Chevron = open ? LuChevronDown : LuChevronRight;
	return (
		<div className="flex flex-col gap-1.5">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-1 self-start text-[12px] font-medium text-muted-foreground hover:text-foreground"
			>
				<Chevron className="size-3.5" />
				Start an agent here
			</button>
			{open ? <div className="flex flex-wrap gap-1">{buttons}</div> : null}
			{waiting.map((s) => (
				<div
					key={s.terminalId}
					className="flex items-center gap-2 text-[11px] text-muted-foreground"
				>
					<span className="min-w-0 flex-1">
						{now - s.since < SLOW_START_MS
							? `Starting ${s.label}…`
							: `${s.label} is running in its terminal but has not shown up here yet.`}
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="h-5 px-1.5 text-[11px]"
						onClick={() =>
							void navigateToV2Workspace(workspaceId, navigate, {
								search: {
									terminalId: s.terminalId,
									focusRequestId: crypto.randomUUID(),
								},
							})
						}
					>
						Terminal
					</Button>
				</div>
			))}
		</div>
	);
}
