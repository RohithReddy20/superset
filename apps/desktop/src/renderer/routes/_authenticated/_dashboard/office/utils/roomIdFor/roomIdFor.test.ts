import { describe, expect, test } from "bun:test";
import { roomIdFor } from "./roomIdFor";

describe("roomIdFor", () => {
	test("slugs the name, pads short ones and avoids taken ids", () => {
		expect(roomIdFor("Research & Ops", [])).toBe("research-ops");
		expect(roomIdFor("Q", [])).toBe("q-room");
		expect(roomIdFor("研究", [])).toBe("room");
		expect(roomIdFor("Design", ["design", "design-2"])).toBe("design-3");
		expect(roomIdFor("A very long room name for the team", [])).toBe(
			"a-very-long-room-nam",
		);
	});
});
