import { describe, expect, test } from "bun:test";
import { TerminalWatch } from "./terminalWatch";

describe("TerminalWatch", () => {
	test("a terminal is gone once it is missing on two checks in a row", async () => {
		let alive: Set<string> | null = new Set(["a"]);
		let now = 0;
		const watch = new TerminalWatch({
			aliveIds: async () => alive,
			everyMs: 10,
			now: () => now,
		});

		await watch.refresh(["a", "b"]);
		expect(watch.goneSince("b")).toBeUndefined();

		now = 5;
		await watch.refresh(["a", "b"]);
		expect(watch.goneSince("b")).toBeUndefined();

		now = 10;
		await watch.refresh(["a", "b"]);
		expect(watch.goneSince("b")).toBe(0);
		expect(watch.goneSince("a")).toBeUndefined();

		alive = null;
		now = 20;
		await watch.refresh(["a", "b"]);
		expect(watch.goneSince("b")).toBeUndefined();
	});
});
