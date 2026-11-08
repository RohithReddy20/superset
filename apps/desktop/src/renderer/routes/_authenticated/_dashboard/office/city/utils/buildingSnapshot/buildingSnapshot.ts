import type { OfficeSnapshot, Teammate } from "../../../types";
import { STATUS_LINES } from "../../constants";
import type { CityAgent, CityProject } from "../../types";

export const YOU_ID = "you";
/** Not a room on the floor, so you start out in the lounge instead of at a workspace's desk. */
const LOBBY = "lobby";

const NO_BUDGET = { dailyTurns: 0, usedToday: 0, day: "" };

/** A building as the office floor draws it: a room per workspace, a person per running agent. */
export function buildingSnapshot(project: CityProject): OfficeSnapshot {
	const agents = project.workspaces.flatMap((w) => w.agents);
	return {
		started: true,
		teammates: [you(), ...agents.map(person)],
		rooms: project.workspaces.map((w) => ({
			id: w.id,
			name: w.name,
			kind: "room",
			members: w.agents.map((a) => a.terminalId),
		})),
		messages: [],
		handoffs: [],
		tasks: [],
		log: [],
		project: null,
		leadId: null,
	};
}

function you(): Teammate {
	return {
		id: YOU_ID,
		name: "You",
		kind: "human",
		role: "",
		roomId: LOBBY,
		presence: "in-office",
		line: "",
		lineSince: 0,
		paused: false,
		budget: NO_BUDGET,
	};
}

function person(agent: CityAgent): Teammate {
	const line = STATUS_LINES[agent.status];
	return {
		id: agent.terminalId,
		name: agent.name,
		kind: "ai",
		role: agent.agentId,
		roomId: agent.workspaceId,
		...(agent.agentId === "claude" || agent.agentId === "codex"
			? { engine: agent.agentId }
			: {}),
		presence: line ? "focused" : "in-office",
		line,
		lineSince: agent.lastEventAt,
		paused: false,
		budget: NO_BUDGET,
	};
}
