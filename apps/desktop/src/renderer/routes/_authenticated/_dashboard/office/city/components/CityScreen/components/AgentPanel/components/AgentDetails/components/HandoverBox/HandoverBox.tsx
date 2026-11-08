import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuArrowRightLeft } from "react-icons/lu";
import { useCityActions } from "../../../../../../../../hooks/useCityActions";
import type {
	CityAgent,
	CityHandover,
	CityProject,
} from "../../../../../../../../types";

interface HandoverBoxProps {
	agent: CityAgent;
	projects: CityProject[];
	handovers: CityHandover[];
	onSelectAgent: (terminalId: string) => void;
}

const KINDS = [
	{ id: "claude", label: "Claude" },
	{ id: "codex", label: "Codex" },
];

/** Moving the agent's work to another workspace: where it stands, an agent's own request, or a form to start one. */
export function HandoverBox({
	agent,
	projects,
	handovers,
	onSelectAgent,
}: HandoverBoxProps) {
	const actions = useCityActions();
	const [open, setOpen] = useState(false);
	const [target, setTarget] = useState("");
	const [kind, setKind] = useState<string>(
		KINDS.some((k) => k.id === agent.agentId) ? agent.agentId : "claude",
	);
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const mine = handovers.filter((h) => h.fromTerminalId === agent.terminalId);
	const latest = mine.at(-1);
	const tookOver = handovers.find((h) => h.newTerminalId === agent.terminalId);
	const active =
		latest &&
		(latest.status === "asked" ||
			latest.status === "briefing" ||
			latest.status === "starting")
			? latest
			: null;

	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
			setOpen(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};

	const picker = (
		<div className="flex flex-col gap-1.5">
			<select
				value={target}
				aria-label="Hand over to"
				onChange={(event) => setTarget(event.target.value)}
				className="h-7 rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
			>
				<option value="">Pick the workspace to continue in…</option>
				{projects.map((project) => (
					<optgroup key={project.id} label={project.name}>
						{project.workspaces
							.filter((w) => w.id !== agent.workspaceId)
							.map((w) => (
								<option key={w.id} value={w.id}>
									{w.name}
								</option>
							))}
					</optgroup>
				))}
			</select>
			<div className="flex items-center gap-1.5">
				<span className="text-[11px] text-muted-foreground">New agent</span>
				<select
					value={kind}
					aria-label="New agent"
					onChange={(event) => setKind(event.target.value)}
					className="h-7 rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
				>
					{KINDS.map((k) => (
						<option key={k.id} value={k.id}>
							{k.label}
						</option>
					))}
				</select>
			</div>
			<textarea
				value={note}
				rows={2}
				placeholder="A note for the new agent (optional)"
				onChange={(event) => setNote(event.target.value)}
				className="resize-none rounded-md border border-input bg-background px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
			/>
		</div>
	);

	return (
		<div className="flex flex-col gap-1.5 rounded-md border border-border p-2 text-[12px]">
			{tookOver ? (
				<span className="text-muted-foreground">
					Took over from {tookOver.fromLabel} in {tookOver.fromWorkspaceName}.
				</span>
			) : null}
			{active?.status === "asked" ? (
				<>
					<span>
						<span className="font-medium">Asks to hand its work over:</span>{" "}
						{active.request}
					</span>
					{picker}
					<div className="flex gap-1.5">
						<Button
							size="sm"
							className="h-7 flex-1"
							disabled={!target || busy}
							onClick={() =>
								run(() =>
									actions.approveHandover({
										id: active.id,
										toWorkspaceId: target,
										agent: kind,
										...(note.trim() ? { note: note.trim() } : {}),
									}),
								)
							}
						>
							Approve
						</Button>
						<Button
							size="sm"
							variant="outline"
							className="h-7 flex-1"
							disabled={busy}
							onClick={() => run(() => actions.declineHandover(active.id))}
						>
							Decline
						</Button>
					</div>
				</>
			) : active?.status === "briefing" ? (
				<div className="flex items-center gap-2">
					<span className="min-w-0 flex-1">
						Writing its brief for {active.toWorkspaceName}…
					</span>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 px-2 text-[11px]"
						onClick={() => run(() => actions.cancelHandover(active.id))}
					>
						Cancel
					</Button>
				</div>
			) : active?.status === "starting" ? (
				<span>Starting the new agent in {active.toWorkspaceName}…</span>
			) : (
				<>
					{latest?.status === "done" && latest.newTerminalId ? (
						<div className="flex items-center gap-2">
							<span className="min-w-0 flex-1">
								Handed its work to {latest.toWorkspaceName}.
							</span>
							<Button
								size="sm"
								variant="ghost"
								className="h-6 px-2 text-[11px]"
								onClick={() => onSelectAgent(latest.newTerminalId as string)}
							>
								Show the new agent
							</Button>
						</div>
					) : latest?.status === "failed" ? (
						<span className="text-red-500">
							Hand-over failed: {latest.error}
						</span>
					) : null}
					{open ? (
						<>
							{picker}
							<div className="flex gap-1.5">
								<Button
									size="sm"
									className="h-7 flex-1"
									disabled={!target || busy}
									onClick={() =>
										run(() =>
											actions.handOver({
												terminalId: agent.terminalId,
												toWorkspaceId: target,
												agent: kind,
												...(note.trim() ? { note: note.trim() } : {}),
											}),
										)
									}
								>
									Hand over
								</Button>
								<Button
									size="sm"
									variant="ghost"
									className="h-7"
									onClick={() => setOpen(false)}
								>
									Cancel
								</Button>
							</div>
						</>
					) : (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 justify-start gap-1.5 px-1 text-[11px]"
							onClick={() => setOpen(true)}
						>
							<LuArrowRightLeft className="size-3" />
							Hand its work to another workspace…
						</Button>
					)}
				</>
			)}
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
		</div>
	);
}
