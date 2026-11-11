import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
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
import { AgentIcon } from "../AgentIcon";

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
	/** Open shows the task box and every CLI; closed is one line to open it. */
	defaultOpen: boolean;
	/** One row of CLIs, each started by one click, like a workspace's own bar. */
	inline?: boolean;
}

/**
 * The CLIs of the workspace's own agent bar (every enabled one when no preset links to an agent);
 * a click starts one in the workspace's folder.
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
	const [draft, setDraft] = useState<{ key: string; name: string } | null>(
		null,
	);
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

	const start = async (agent: string, label: string, name?: string) => {
		setError(null);
		try {
			const result = await actions.startAgent({
				workspaceId,
				agent,
				prompt: task.trim(),
				...(name?.trim() ? { name: name.trim() } : {}),
			});
			setDraft(null);
			setTask("");
			setStarting((list) => [
				...list,
				{
					terminalId: result.terminalId,
					label: `${result.name} (${label})`,
					since: Date.now(),
				},
			]);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	if (choices.length === 0) return null;
	if (inline)
		return (
			<div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none]">
				{choices.map(({ key, label, agent }) => (
					<Popover
						key={key}
						open={draft?.key === key}
						onOpenChange={(next) => {
							setError(null);
							setDraft(next ? { key, name: nextName } : null);
						}}
					>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								title={`Start ${label} here`}
								className="h-7 shrink-0 gap-1.5 rounded-md px-2 text-[12px] font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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
						</PopoverTrigger>
						<PopoverContent align="start" className="w-72 p-3">
							<p className="mb-2 text-[12px] font-medium">
								Start {label} in this workspace
							</p>
							<form
								className="flex flex-col gap-2 text-[12px]"
								onSubmit={(event) => {
									event.preventDefault();
									void start(agent.id, label, draft?.name);
								}}
							>
								<label className="flex flex-col gap-1 text-muted-foreground">
									Name
									<input
										value={draft?.name ?? ""}
										onChange={(event) =>
											setDraft({ key, name: event.target.value })
										}
										className="h-7 rounded-md border border-input bg-background px-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									/>
								</label>
								<label className="flex flex-col gap-1 text-muted-foreground">
									First task (optional)
									<input
										value={task}
										onChange={(event) => setTask(event.target.value)}
										className="h-7 rounded-md border border-input bg-background px-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									/>
								</label>
								{error ? (
									<p role="alert" className="text-red-500">
										{error}
									</p>
								) : null}
								<div className="flex items-center justify-between gap-2">
									<span className="text-[11px] text-muted-foreground">
										Enter creates it
									</span>
									<Button
										autoFocus
										type="submit"
										size="sm"
										className="h-7 px-3 text-[12px]"
									>
										Create {label}
									</Button>
								</div>
							</form>
						</PopoverContent>
					</Popover>
				))}
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
			{open ? (
				<>
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
									task.trim()
										? `Start ${label} with this task`
										: `Start ${label}`
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
				</>
			) : null}
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
