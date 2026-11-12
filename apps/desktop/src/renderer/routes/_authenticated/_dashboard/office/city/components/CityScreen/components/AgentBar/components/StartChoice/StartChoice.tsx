import {
	getAgentEfforts,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useLayoutEffect, useRef, useState } from "react";
import { useAgentEffortPreference } from "renderer/hooks/useAgentEffortPreference";
import { useAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { AgentIcon } from "../../../AgentIcon";
import { LaunchSelect } from "./components/LaunchSelect";
import {
	OFFICE_EFFORT_STORAGE_KEY,
	OFFICE_MODEL_STORAGE_KEY,
} from "./constants";

export interface StartRequest {
	prompt: string;
	name?: string;
	model?: string;
	effort?: string;
}

interface StartChoiceProps {
	label: string;
	iconId: string;
	/** The preset whose models and efforts this CLI takes. */
	launchPresetId: string;
	/** The name the city gives when the person types none. */
	nextName: string;
	/** A smaller button, for the room panel. */
	compact?: boolean;
	/** Rejects with what went wrong; the box stays open and shows it. */
	onStart: (request: StartRequest) => Promise<void>;
}

const FIELD =
	"rounded-md border border-input bg-background px-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const TASK_MAX_PX = 180;

/** One CLI of the start row: a click opens a box for its name, first task, model and effort. */
export function StartChoice({
	label,
	iconId,
	launchPresetId,
	nextName,
	compact = false,
	onStart,
}: StartChoiceProps) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [task, setTask] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const taskRef = useRef<HTMLTextAreaElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the box grows with its text, and is measured once it opens
	useLayoutEffect(() => {
		const node = taskRef.current;
		if (!node) return;
		node.style.height = "auto";
		node.style.height = `${Math.min(node.scrollHeight + 2, TASK_MAX_PX)}px`;
	}, [task, open]);
	const models = getAgentModelSupport(launchPresetId)?.models ?? [];
	const { selectedModel, setSelectedModel } = useAgentModelPreference(
		OFFICE_MODEL_STORAGE_KEY,
		models.length > 0 ? launchPresetId : null,
	);
	const { selectedEffort, setSelectedEffort } = useAgentEffortPreference(
		OFFICE_EFFORT_STORAGE_KEY,
		launchPresetId,
	);
	const efforts = getAgentEfforts(launchPresetId, selectedModel ?? undefined);
	const effort = efforts.some((option) => option.id === selectedEffort)
		? selectedEffort
		: null;

	const submit = async () => {
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			await onStart({
				prompt: task.trim(),
				...(name.trim() ? { name: name.trim() } : {}),
				...(selectedModel ? { model: selectedModel } : {}),
				...(effort ? { effort } : {}),
			});
			setTask("");
			setOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setError(null);
				if (next) setName(nextName);
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={`Start ${label} here`}
					className={cn(
						"shrink-0 gap-1.5 rounded-md px-2 text-[12px] font-normal text-muted-foreground hover:bg-muted/60 hover:text-foreground",
						compact ? "h-6" : "h-7",
					)}
				>
					<AgentIcon agentId={iconId} className="size-3.5" />
					{label}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-3">
				<p className="mb-2 text-[12px] font-medium">
					Start {label} in this workspace
				</p>
				<form
					className="flex flex-col gap-2 text-[12px]"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<label className="flex flex-col gap-1 text-muted-foreground">
						Name
						<input
							value={name}
							onChange={(event) => setName(event.target.value)}
							className={cn(FIELD, "h-7")}
						/>
					</label>
					<label className="flex flex-col gap-1 text-muted-foreground">
						First task (optional)
						<textarea
							ref={taskRef}
							rows={1}
							placeholder="Shift+Enter for a new line"
							value={task}
							onChange={(event) => setTask(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Enter" || event.shiftKey) return;
								if (event.nativeEvent.isComposing) return;
								event.preventDefault();
								void submit();
							}}
							className={cn(
								FIELD,
								"min-h-7 resize-none overflow-y-auto py-1 leading-snug",
							)}
						/>
					</label>
					{models.length > 0 || efforts.length > 0 ? (
						<div className="grid grid-cols-2 gap-2">
							{models.length > 0 ? (
								<LaunchSelect
									label="Model"
									options={models}
									value={selectedModel}
									onChange={setSelectedModel}
								/>
							) : null}
							{efforts.length > 0 ? (
								<LaunchSelect
									label="Effort"
									options={efforts}
									value={effort}
									onChange={setSelectedEffort}
								/>
							) : null}
						</div>
					) : null}
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
							disabled={busy}
							className="h-7 px-3 text-[12px]"
						>
							Create {label}
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
