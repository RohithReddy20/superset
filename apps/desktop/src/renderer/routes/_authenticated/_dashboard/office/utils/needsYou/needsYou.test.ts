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

	test("puts a question before a failure, a hand-over, office tasks and finished work", () => {
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
			tasks: [
				{ id: "T-1", title: "Docs", status: "verified", updatedAt: 1 },
				{ id: "T-2", title: "Port", status: "blocked", updatedAt: 1 },
				{ id: "T-3", title: "Lint", status: "doing", updatedAt: 1 },
			],
		});
		expect(items.map((i) => i.id)).toEqual([
			"agent:asks",
			"agent:broke",
			"handover:h-mover",
			"task:T-2",
			"task:T-1",
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

	test("opens an agent seated in the office in its own project's building", () => {
		const [item] = needsYou({
			projects: city([
				agent("guest", "permission", 1, { projectId: "office", roomId: "eng" }),
			]),
			handovers: [],
		});
		expect(item?.target).toEqual({
			kind: "agent",
			projectId: "p1",
			terminalId: "guest",
		});
	});
});

describe("needsYou with city tasks", () => {
	test("a checked or blocked task opens its agent, in place of the agent's own 'done'", () => {
		const items = needsYou({
			projects: city([agent("worker", "review", 1)]),
			handovers: [],
			cityTasks: [
				{
					id: "C-1",
					title: "Health",
					status: "ready",
					updatedAt: 2,
					terminalId: "worker",
					projectId: "p1",
					agentName: "worker",
				},
				{
					id: "C-2",
					title: "Docs",
					status: "working",
					updatedAt: 2,
					terminalId: "other",
					projectId: "p1",
					agentName: "other",
				},
			],
		});
		expect(items.map((i) => [i.id, i.reason])).toEqual([
			["city-task:C-1", "verified"],
		]);
		expect(items[0]?.target).toEqual({
			kind: "agent",
			projectId: "p1",
			terminalId: "worker",
		});
	});
});
