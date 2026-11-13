import { expect, test } from "bun:test";
import type { CityAgent, CityNote, CityProject } from "../../../../types";
import { liveliestRoom, teamRooms } from "./teamRooms";

const agent = (
	terminalId: string,
	projectId: string,
	workspaceId: string,
	place = { projectId, roomId: workspaceId },
) =>
	({
		terminalId,
		name: terminalId,
		projectId,
		workspaceId,
		place,
	}) as CityAgent;

const project = (
	id: string,
	workspaces: Array<{ id: string; createdAt: number; agents: CityAgent[] }>,
) =>
	({
		id,
		workspaces: workspaces.map((w) => ({ ...w, name: w.id, branch: null })),
	}) as CityProject;

const city = () => [
	project("p1", [
		{
			id: "a",
			createdAt: 1,
			agents: [
				agent("t1", "p1", "a"),
				agent("t2", "p1", "a", { projectId: "p2", roomId: "c" }),
				agent("t5", "p1", "a", { projectId: "gone", roomId: "x" }),
			],
		},
	]),
	project("p2", [
		{ id: "c", createdAt: 2, agents: [agent("t3", "p2", "c")] },
		{
			id: "b",
			createdAt: 1,
			agents: [agent("t4", "p2", "b", { projectId: "p2", roomId: "meeting" })],
		},
	]),
];

test("rooms list who sits in them; a seat that is gone falls back to the agent's own room", () => {
	const rooms = teamRooms(city());
	expect(rooms.map((r) => [r.name, r.people.map((p) => p.terminalId)])).toEqual(
		[
			["a", ["t1", "t5"]],
			["b", []],
			["c", ["t2", "t3"]],
			["Meeting room", ["t4"]],
		],
	);
});

test("the room people last talked in opens first, never an empty one", () => {
	const rooms = teamRooms(city());
	const note = (fromId: string, toIds: string[], at: number) =>
		({ fromId, toIds, at }) as CityNote;
	expect(liveliestRoom(rooms, [])?.name).toBe("a");
	expect(
		liveliestRoom(rooms, [note("t1", ["you"], 5), note("t2", ["t3"], 9)])?.name,
	).toBe("c");
	expect(liveliestRoom(teamRooms([project("p", [])]), [])).toBeNull();
});
