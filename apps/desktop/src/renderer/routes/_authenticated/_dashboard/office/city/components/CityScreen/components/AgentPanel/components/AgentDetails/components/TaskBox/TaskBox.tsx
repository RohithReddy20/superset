import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuListPlus } from "react-icons/lu";
import { useCityTasks } from "../../../../../../../../hooks/useCityTasks";
import {
	type CityAgent,
	OPEN_TASK_STATUSES,
} from "../../../../../../../../types";
import { GiveTaskForm } from "./components/GiveTaskForm";
import { TaskCard } from "./components/TaskCard";

interface TaskBoxProps {
	agent: Pick<CityAgent, "terminalId" | "projectId" | "name" | "status">;
}

/** The agent's task: give it one, follow it through its checks, and decide when it is ready. */
export function TaskBox({ agent }: TaskBoxProps) {
	const city = useCityTasks();
	const [giving, setGiving] = useState(false);
	const mine = city.tasks.filter((t) => t.terminalId === agent.terminalId);
	const open = mine.find((t) => OPEN_TASK_STATUSES.includes(t.status));
	const checking = city.tasks.find(
		(t) => t.checkerTerminalId === agent.terminalId,
	);
	const last = open ?? mine[0];

	if (checking)
		return (
			<p className="rounded-md border border-border p-2 text-[12px] text-muted-foreground">
				Checking {checking.id} "{checking.title}" for {checking.agentName}. It
				stops when it gives its verdict.
			</p>
		);
	if (giving && !open)
		return (
			<GiveTaskForm
				agentName={agent.name}
				defaultCheckCommand={city.checkCommands[agent.projectId] ?? ""}
				onCancel={() => setGiving(false)}
				onGive={async (input) => {
					await city.give({ terminalId: agent.terminalId, ...input });
					setGiving(false);
				}}
			/>
		);
	return (
		<div className="flex flex-col gap-1.5">
			{last ? (
				<TaskCard
					task={last}
					paused={agent.status === "lost"}
					onAskForPullRequest={() => city.askForPullRequest(last.id)}
					onClose={() => city.close(last.id)}
					onCancel={() => city.cancel(last.id)}
					onSendBack={(note) => city.sendBack(last.id, note)}
				/>
			) : null}
			{open || agent.status === "lost" ? null : (
				<Button
					variant="outline"
					size="sm"
					className="h-7 gap-1.5 self-start text-[12px]"
					onClick={() => setGiving(true)}
				>
					<LuListPlus className="size-3.5" />
					{last ? "Give it another task" : "Give it a task"}
				</Button>
			)}
		</div>
	);
}
