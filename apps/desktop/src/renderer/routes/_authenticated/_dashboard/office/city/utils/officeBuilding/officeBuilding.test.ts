import { describe, expect, test } from "bun:test";
import { officeBuilding } from "./officeBuilding";

const teammate = (
	id: string,
	roomId: string,
	presence: "away" | "in-office" | "focused" | "in-meeting",
	extra: { kind?: "human" | "ai"; paused?: boolean } = {},
) => ({
	id,
	name: id,
	kind: extra.kind ?? ("ai" as const),
	role: "",
	roomId,
	presence,
	line: "",
	lineSince: 0,
	paused: extra.paused ?? false,
});

describe("officeBuilding", () => {
	test("has a floor per chat room and a lit window per busy AI teammate", () => {
		const building = officeBuilding({
			rooms: [
				{ id: "eng", name: "engineering", kind: "room", members: [] },
				{ id: "design", name: "design", kind: "room", members: [] },
				{ id: "group-a+b", name: "group", kind: "dm", members: [] },
			],
			teammates: [
				teammate("you", "eng", "in-office", { kind: "human" }),
				teammate("bash", "eng", "focused"),
				teammate("scout", "eng", "focused", { paused: true }),
				teammate("ledger", "design", "in-office"),
			],
		});
		expect(building.workspaces.map((w) => w.id)).toEqual(["eng", "design"]);
		expect(building.workspaces[0]?.agents.map((a) => a.status)).toEqual([
			"working",
			"idle",
		]);
		expect(building.workspaces[1]?.agents.map((a) => a.status)).toEqual([
			"idle",
		]);
	});
});
