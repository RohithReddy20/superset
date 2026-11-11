import { describe, expect, test } from "bun:test";
import type { CityAgent, CityHandover, CityProject } from "../../city/types";
import { needsYou } from "./needsYou";

function agent(
	terminalId: string,
	status: CityAgent["status"],
	lastEventAt: number,
	place = { projectId: "p1", roomId: "w1" },
): CityAgent {
	return {
		terminalId,
		workspaceId: "w1",
		projectId: "p1",
		workspaceName: "Check health",
		agentId: "claude",
		kind: "Claude",
		name: terminalId,
		handle: "",
		status,
		startedAt: 0,
		lastEventAt,
		subagents: 0,
		place,
	};
}

function city(agents: CityAgent[]): CityProject[] {
	return [
		{
			id: "p1",
			name: "api",
			color: null,
			iconUrl: null,
			createdAt: 0,
			workspaces: [
				{ id: "w1", name: "Check health", branch: null, createdAt: 0, agents },
			],
		},
	];
}

function handover(
	fromTerminalId: string,
	status: CityHandover["status"],
): CityHandover {
	return {
		id: `h-${fromTerminalId}`,
		fromTerminalId,
		fromLabel: fromTerminalId,
		fromWorkspaceName: "Check health",
		requestedBy: "agent",
		status,
		createdAt: 5,
	};
}

describe("needsYou", () => {
	test("a disconnected agent needs you, unless it is already reconnecting", () => {
		const reconnecting = {
			...agent("t2", "lost", 2),
			lost: { resumable: true, reconnecting: true },
		};
		const items = needsYou({
			projects: city([
				{
					...agent("t1", "lost", 1),
					lost: { resumable: true, reconnecting: false },
				},
				reconnecting,
				agent("t3", "review", 3),
			]),
			handovers: [],
		});
		expect(items.map((i) => [i.title, i.reason])).toEqual([
			["t1", "lost"],
			["t3", "review"],
		]);
	});

	test("puts a question before a failure, a hand-over and finished work", () => {
		const items = needsYou({
			projects: city([
				agent("done", "review", 1),
				agent("broke", "failed", 2),
				agent("asks", "permission", 3),
				agent("busy", "working", 4),
				agent("quiet", "idle", 4),
				agent("mover", "working", 4),
			]),
			handovers: [handover("mover", "asked"), handover("quiet", "done")],
		});
		expect(items.map((i) => i.id)).toEqual([
			"agent:asks",
			"agent:broke",
			"handover:h-mover",
			"agent:done",
		]);
		expect(items[0]?.where).toBe("Check health · api");
	});

	test("lists the longest waiting first within one reason", () => {
		const items = needsYou({
			projects: city([
				agent("late", "permission", 9),
				agent("early", "permission", 1),
			]),
			handovers: [],
		});
		expect(items.map((i) => i.title)).toEqual(["early", "late"]);
	});
});

describe("needsYou with the team", () => {
	test("what an agent asked of you needs you until you finish or drop it", () => {
		const projects = city([agent("t1", "idle", 1)]);
		const todo = {
			id: "D-1",
			ownerId: "you",
			text: "Pick a port",
			askedById: "t1",
			askedByName: "t1",
			createdAt: 3,
		};
		const open = needsYou({
			projects,
			handovers: [],
			todos: [{ ...todo, state: "open" }],
		});
		expect(open).toMatchObject([
			{ reason: "asked", note: "Asks you: Pick a port", title: "t1" },
		]);
		expect(
			needsYou({
				projects,
				handovers: [],
				todos: [{ ...todo, state: "finished" }],
			}),
		).toEqual([]);
	});
});
