import { Button } from "@superset/ui/button";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { findLinkedAgent } from "renderer/lib/agent-launch-command";
import { resolveV2PresetIconKey } from "renderer/lib/preset-icon-key";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { filterMatchingPresetsForProject } from "shared/preset-project-targeting";
import { useCityActions } from "../../../../../../../../../../hooks/useCityActions";
import { AgentIcon } from "../../../../../AgentIcon";

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
}

/**
 * The CLIs of the workspace's own agent bar (every enabled one when no preset links to an agent);
 * a click starts one in the workspace's folder.
 */
export function AgentBar({ workspaceId, projectId, shown }: AgentBarProps) {
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
	const [task, setTask] = useState("");
	const [starting, setStarting] = useState<Starting[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [now, setNow] = useState(Date.now());

	const waiting = starting.filter((s) => !shown.includes(s.terminalId));
	const anyWaiting = waiting.length > 0;
	useEffect(() => {
		if (!anyWaiting) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [anyWaiting]);

	const start = async (agent: string, label: string) => {
		setError(null);
		try {
			const result = await actions.startAgent({
				workspaceId,
				agent,
				prompt: task.trim(),
			});
			setTask("");
			setStarting((list) => [
				...list,
				{ terminalId: result.sessionId, label, since: Date.now() },
			]);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	if (choices.length === 0) return null;
	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
				Start an agent here
			</span>
			<input
				value={task}
				placeholder="First task for it (optional)"
				onChange={(event) => setTask(event.target.value)}
				className="h-7 rounded-md border border-input bg-background px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
			/>
			<div className="flex flex-wrap gap-1">
				{choices.map(({ key, label, agent }) => (
					<Button
						key={key}
						variant="ghost"
						size="sm"
						title={
							task.trim() ? `Start ${label} with this task` : `Start ${label}`
						}
						className="h-6 gap-1.5 rounded-md px-2 text-[12px] font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground"
						onClick={() => void start(agent.id, label)}
					>
						<AgentIcon
							agentId={
								resolveV2PresetIconKey({ agentId: agent.id }, configs) ??
								agent.presetId
							}
							className="size-3.5"
						/>
						{label}
					</Button>
				))}
			</div>
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
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
		</div>
	);
}
