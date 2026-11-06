import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuMessageSquare, LuRotateCcw } from "react-icons/lu";
import type { Task, TaskStatus, Teammate } from "../../types";
import { formatUsage } from "../../utils/formatUsage";
import { EngineMark } from "../EngineMark";

interface TaskBoardProps {
	tasks: Task[];
	teammates: Teammate[];
	me: Teammate | null;
	pending: boolean;
	onOpenThread: (task: Task) => void;
	onAssign: (task: Task, ownerId: string) => void;
	onUpdate: (task: Task, status: TaskStatus, note: string) => void;
}

const STATUS_STYLE: Record<TaskStatus, string> = {
	todo: "text-muted-foreground border-border",
	doing: "text-[#f5b942] border-[#f5b942]/50",
	review: "text-[#5c9cf5] border-[#5c9cf5]/50",
	verified: "text-[#39d353] border-[#39d353]/50",
	done: "text-muted-foreground border-border line-through",
	blocked: "text-destructive border-destructive/50",
};

const ORDER: TaskStatus[] = [
	"blocked",
	"verified",
	"review",
	"doing",
	"todo",
	"done",
];

export function TaskBoard({
	tasks,
	teammates,
	me,
	pending,
	onOpenThread,
	onAssign,
	onUpdate,
}: TaskBoardProps) {
	const byId = new Map(teammates.map((t) => [t.id, t]));
	const ordered = [...tasks].sort(
		(a, b) =>
			ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
			b.updatedAt - a.updatedAt,
	);
	if (ordered.length === 0)
		return (
			<p className="px-3 py-2 text-[12px] text-muted-foreground">
				No tasks yet. Open one with “+ task”, give it an owner, and watch it
				move: doing, review, verified, done.
			</p>
		);
	return (
		<ul className="flex flex-col gap-1.5 px-2 py-2">
			{ordered.map((task) => {
				const owner = task.ownerId ? byId.get(task.ownerId) : undefined;
				const verifier = task.verifierId
					? byId.get(task.verifierId)
					: undefined;
				const last = task.notes.at(-1);
				return (
					<li
						key={task.id}
						className={cn(
							"rounded-md border border-border bg-card px-2.5 py-2",
							task.status === "done" && "opacity-60",
						)}
					>
						<div className="flex items-center gap-2">
							<span className="font-mono text-[10px] text-muted-foreground">
								{task.id}
							</span>
							<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
								{task.title}
							</span>
							<span
								className={cn(
									"rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em]",
									STATUS_STYLE[task.status],
								)}
							>
								{task.status}
							</span>
						</div>
						<div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
							<EngineMark engine={owner?.engine} />
							<span>{owner ? owner.name : "unowned"}</span>
							{verifier ? (
								<>
									<span>· checked by</span>
									<EngineMark engine={verifier.engine} />
									<span>{verifier.name}</span>
								</>
							) : null}
							<span className="ml-auto font-mono text-[10px]">
								{task.rounds.used}/{task.rounds.max}
								{task.usage ? ` · ${formatUsage(task.usage)}` : ""}
								{task.check
									? task.check.ok
										? " · checks ✓"
										: " · checks ✗"
									: ""}
							</span>
						</div>
						{task.branch ? (
							<div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
								{task.branch}
							</div>
						) : null}
						{last ? (
							<p className="mt-1 line-clamp-2 text-[12px] leading-snug text-foreground/80">
								{byId.get(last.by)?.name ?? last.by}: {last.text}
							</p>
						) : null}
						<div className="mt-1.5 flex items-center gap-1.5">
							<Select
								value={task.ownerId ?? ""}
								onValueChange={(ownerId) => onAssign(task, ownerId)}
								disabled={pending || !me || task.status === "done"}
							>
								<SelectTrigger className="h-7 w-[130px] text-[11px]">
									<SelectValue placeholder="Assign to…" />
								</SelectTrigger>
								<SelectContent>
									{teammates
										.filter((t) => t.kind === "ai")
										.map((t) => (
											<SelectItem key={t.id} value={t.id}>
												{t.name}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-[11px]"
								onClick={() => onOpenThread(task)}
							>
								<LuMessageSquare className="size-3" /> thread
							</Button>
							{task.status === "verified" || task.status === "review" ? (
								<Button
									size="sm"
									className="ml-auto h-7 px-2 text-[11px]"
									disabled={pending || !me}
									onClick={() => onUpdate(task, "done", "closed")}
								>
									<LuCheck className="size-3" /> done
								</Button>
							) : null}
							{task.status === "blocked" || task.status === "verified" ? (
								<Button
									variant="outline"
									size="sm"
									className={cn(
										"h-7 px-2 text-[11px]",
										task.status === "blocked" && "ml-auto",
									)}
									disabled={pending || !me || !task.ownerId}
									onClick={() =>
										onUpdate(task, "doing", "sent back by a person; try again")
									}
								>
									<LuRotateCcw className="size-3" /> redo
								</Button>
							) : null}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
