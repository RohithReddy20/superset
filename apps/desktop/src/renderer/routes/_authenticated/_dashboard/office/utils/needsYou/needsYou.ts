import { askingLine } from "../../city/constants";
import type { CityAgent, CityHandover, CityProject } from "../../city/types";
import { OFFICE_PLACE } from "../../city/types";
import type { Task } from "../../types";

export type NeedsYouReason =
	| "permission"
	| "failed"
	| "handover"
	| "blocked"
	| "verified"
	| "review";

export type NeedsYouTarget =
	| { kind: "agent"; projectId: string; terminalId: string }
	| { kind: "tasks" };

export interface NeedsYouItem {
	id: string;
	reason: NeedsYouReason;
	/** Says more than the reason does, e.g. "Asks to trust this folder". */
	note?: string;
	title: string;
	where: string;
	since: number;
	target: NeedsYouTarget;
}

const ORDER: NeedsYouReason[] = [
	"permission",
	"failed",
	"handover",
	"blocked",
	"verified",
	"review",
];

const AGENT_REASONS = new Set<CityAgent["status"]>([
	"permission",
	"failed",
	"review",
]);

/** Everything waiting on the person, most urgent first, then longest waiting first. */
export function needsYou({
	projects,
	handovers,
	tasks = [],
}: {
	projects: CityProject[];
	handovers: CityHandover[];
	tasks?: Pick<Task, "id" | "title" | "status" | "updatedAt">[];
}): NeedsYouItem[] {
	const projectName = new Map(projects.map((p) => [p.id, p.name]));
	const agents = projects.flatMap((p) => p.workspaces.flatMap((w) => w.agents));
	const byTerminal = new Map(agents.map((a) => [a.terminalId, a]));
	const items: NeedsYouItem[] = [];

	for (const agent of agents) {
		if (!AGENT_REASONS.has(agent.status)) continue;
		items.push({
			id: `agent:${agent.terminalId}`,
			reason: agent.status as NeedsYouReason,
			...(agent.asking ? { note: askingLine(agent.asking) } : {}),
			title: agent.name,
			where: whereOf(agent, projectName),
			since: agent.lastEventAt,
			target: agentTarget(agent),
		});
	}

	for (const handover of handovers) {
		if (handover.status !== "asked") continue;
		const agent = byTerminal.get(handover.fromTerminalId);
		if (!agent) continue;
		items.push({
			id: `handover:${handover.id}`,
			reason: "handover",
			title: agent.name,
			where: whereOf(agent, projectName),
			since: handover.createdAt,
			target: agentTarget(agent),
		});
	}

	for (const task of tasks) {
		if (task.status !== "blocked" && task.status !== "verified") continue;
		items.push({
			id: `task:${task.id}`,
			reason: task.status,
			title: `${task.id} ${task.title}`,
			where: "Office",
			since: task.updatedAt,
			target: { kind: "tasks" },
		});
	}

	return items.sort(
		(a, b) =>
			ORDER.indexOf(a.reason) - ORDER.indexOf(b.reason) || a.since - b.since,
	);
}

function whereOf(agent: CityAgent, projectName: Map<string, string>): string {
	const project = projectName.get(agent.projectId);
	return project ? `${agent.workspaceName} · ${project}` : agent.workspaceName;
}

/** The building it is drawn in; an agent seated in the office opens in its own project's building. */
function agentTarget(agent: CityAgent): NeedsYouTarget {
	return {
		kind: "agent",
		projectId:
			agent.place.projectId === OFFICE_PLACE
				? agent.projectId
				: agent.place.projectId,
		terminalId: agent.terminalId,
	};
}
