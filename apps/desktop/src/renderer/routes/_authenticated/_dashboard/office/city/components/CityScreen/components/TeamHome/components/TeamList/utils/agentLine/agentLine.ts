import { waitingOn } from "../../../../../../../../../utils/waitingOn";
import { askingLine, STATUS_LINES } from "../../../../../../../../constants";
import {
	type CityAgent,
	type CityNote,
	type CityTodo,
	isOpenTodo,
	YOU,
} from "../../../../../../../../types";

export type AgentLineTone = "needsYou" | "waiting" | "doing" | "done" | "quiet";

export interface AgentLine {
	text: string;
	tone: AgentLineTone;
}

const NEEDS_YOU = new Set<CityAgent["status"]>([
	"permission",
	"failed",
	"lost",
]);

/**
 * One line on what an agent is at: what it needs from you first, then who it waits on, then what
 * it works on.
 */
export function agentLine(
	agent: Pick<CityAgent, "terminalId" | "status" | "asking">,
	todos: Pick<
		CityTodo,
		| "ownerId"
		| "ownerName"
		| "text"
		| "state"
		| "askedById"
		| "askedByName"
		| "createdAt"
	>[],
	notes: Pick<CityNote, "fromId" | "toIds" | "at">[],
): AgentLine {
	if (agent.asking) return { text: askingLine(agent.asking), tone: "needsYou" };
	if (NEEDS_YOU.has(agent.status))
		return { text: STATUS_LINES[agent.status], tone: "needsYou" };

	const ofYou = todos.find(
		(t) =>
			isOpenTodo(t) && t.askedById === agent.terminalId && t.ownerId === YOU,
	);
	if (ofYou) return { text: `Asks you: ${ofYou.text}`, tone: "needsYou" };
	const pending = waitingOn(agent.terminalId, todos, notes);
	if (pending)
		return {
			text: `Waiting on ${pending.ownerName}: ${pending.text}`,
			tone: "waiting",
		};

	const own = todos.filter((t) => t.ownerId === agent.terminalId);
	const doing = own.find((t) => t.state === "doing");
	if (doing)
		return {
			text: doing.askedById
				? `For ${doing.askedById === YOU ? "you" : doing.askedByName}: ${doing.text}`
				: doing.text,
			tone: "doing",
		};
	if (agent.status === "working")
		return { text: STATUS_LINES.working, tone: "doing" };
	if (agent.status === "review")
		return { text: STATUS_LINES.review, tone: "done" };
	const next = own.find((t) => t.state === "open");
	return { text: next ? `Next: ${next.text}` : "Idle", tone: "quiet" };
}
