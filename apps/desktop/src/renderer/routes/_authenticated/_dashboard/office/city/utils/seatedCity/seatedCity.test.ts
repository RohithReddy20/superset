import { expect, test } from "bun:test";
import type { CityAgent, CityProject } from "../../types";
import { seatedCity } from "./seatedCity";

const agent = (
	terminalId: string,
	projectId: string,
	workspaceId: string,
	place = { projectId, roomId: workspaceId },
) => ({ terminalId, projectId, workspaceId, place }) as CityAgent;

const project = (
	id: string,
	workspaces: Array<{ id: string; createdAt: number; agents: CityAgent[] }>,
) =>
	({
		id,
		workspaces: workspaces.map((w) => ({ ...w, name: w.id, branch: null })),
	}) as CityProject;

test("people are listed where they sit, and a meeting room's people with the first workspace", () => {
	const seated = seatedCity([
		project("p1", [
			{
				id: "a",
				createdAt: 1,
				agents: [
					agent("t1", "p1", "a"),
					agent("t2", "p1", "a", { projectId: "p2", roomId: "c" }),
				],
			},
		]),
		project("p2", [
			{ id: "c", createdAt: 2, agents: [agent("t3", "p2", "c")] },
			{
				id: "b",
				createdAt: 1,
				agents: [
					agent("t4", "p2", "b", { projectId: "p2", roomId: "meeting" }),
				],
			},
		]),
	]);
	const who = (p: number, w: number) =>
		seated[p]?.workspaces[w]?.agents.map((a) => a.terminalId);
	expect(who(0, 0)).toEqual(["t1"]);
	expect(who(1, 0)).toEqual(["t2", "t3"]);
	expect(who(1, 1)).toEqual(["t4"]);
});
