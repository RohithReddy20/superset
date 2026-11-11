import { askingLine } from "../../city/constants";
import type {
	CityAgent,
	CityHandover,
	CityNote,
	CityProject,
	CityTodo,
} from "../../city/types";
import { isOpenTodo, YOU } from "../../city/types";

export type NeedsYouReason =
	| "permission"
	| "failed"
	| "asked"
	| "wrote"
	| "handover"
	| "lost"
	| "review";

export interface NeedsYouTarget {
	projectId: string;
	terminalId: string;
}

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
	"asked",
	"wrote",
	"handover",
	"lost",
	"review",
];

const AGENT_REASONS = new Set<CityAgent["status"]>([
	"permission",
	"failed",
	"lost",
	"review",
]);

/** Everything waiting on the person, most urgent first, then longest waiting first. */
export function needsYou({
	projects,
	handovers,
	todos = [],
	unread = [],
}: {
	projects: CityProject[];
	handovers: CityHandover[];
	todos?: Pick<
		CityTodo,
		| "id"
		| "ownerId"
		| "state"
		| "text"
		| "askedById"
		| "askedByName"
		| "createdAt"
	>[];
	/** What teammates wrote to the person and the person has not read. */
	unread?: Pick<CityNote, "id" | "fromId" | "text" | "at">[];
}): NeedsYouItem[] {
	const projectName = new Map(projects.map((p) => [p.id, p.name]));
	const agents = projects.flatMap((p) => p.workspaces.flatMap((w) => w.agents));
	const byTerminal = new Map(agents.map((a) => [a.terminalId, a]));
	const items: NeedsYouItem[] = [];
	for (const agent of agents) {
		if (!AGENT_REASONS.has(agent.status)) continue;
		if (agent.lost?.reconnecting) continue;
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

	for (const todo of todos) {
		if (todo.ownerId !== YOU || !isOpenTodo(todo) || !todo.askedById) continue;
		const agent = byTerminal.get(todo.askedById);
		if (!agent) continue;
		items.push({
			id: `todo:${todo.id}`,
			reason: "asked",
			note: `Asks you: ${todo.text}`,
			title: agent.name,
			where: whereOf(agent, projectName),
			since: todo.createdAt,
			target: agentTarget(agent),
		});
	}

	const latest = new Map(unread.map((n) => [n.fromId, n]));
	for (const note of latest.values()) {
		const agent = byTerminal.get(note.fromId);
		if (!agent) continue;
		items.push({
			id: `note:${note.id}`,
			reason: "wrote",
			note: `Wrote to you: ${note.text.split("\n")[0]}`,
			title: agent.name,
			where: whereOf(agent, projectName),
			since: note.at,
			target: agentTarget(agent),
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

function agentTarget(agent: CityAgent): NeedsYouTarget {
	return { projectId: agent.place.projectId, terminalId: agent.terminalId };
}
