import { expect, test } from "bun:test";
import { type CityNote, YOU } from "../../types";
import { roomTalk } from "./roomTalk";

const note = (id: string, fromId: string, toIds: string[]): CityNote => ({
	id,
	fromId,
	fromName: fromId,
	toIds,
	text: id,
	expectsReply: false,
	at: 0,
});

test("a room shows what was written to it and what the people sitting there wrote to each other", () => {
	const place = { projectId: "p", roomId: "r" };
	const notes: CityNote[] = [
		{ ...note("to-room", "a", ["b"]), room: { ...place, name: "R" } },
		{
			...note("other-room", "a", ["b"]),
			room: { projectId: "p", roomId: "x", name: "X" },
		},
		note("between", "a", ["b"]),
		note("to-outsider", "a", ["c"]),
		note("to-person", "b", [YOU]),
		note("person-to-outsider", YOU, ["c"]),
	];
	expect(roomTalk(notes, place, new Set(["a", "b"])).map((n) => n.id)).toEqual([
		"to-room",
		"between",
		"to-person",
	]);
});
