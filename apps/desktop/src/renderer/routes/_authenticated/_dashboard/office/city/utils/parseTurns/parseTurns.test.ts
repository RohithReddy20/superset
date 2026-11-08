import { describe, expect, test } from "bun:test";
import { lastReply, parseTurns } from "./parseTurns";

describe("parseTurns", () => {
	test("splits a conversation record into your turns and the agent's", () => {
		const text =
			"User: make health.txt\n\nAssistant: Done.\nIt says ok.\n\nUser: thanks";
		expect(parseTurns(text)).toEqual([
			{ who: "you", text: "make health.txt" },
			{ who: "agent", text: "Done.\nIt says ok." },
			{ who: "you", text: "thanks" },
		]);
	});

	test("keeps the cut-off start of a long record as the agent's", () => {
		expect(parseTurns("…end of a long answer\n\nUser: next")).toEqual([
			{ who: "agent", text: "…end of a long answer" },
			{ who: "you", text: "next" },
		]);
	});
});

describe("lastReply", () => {
	test("is the agent's last turn in a conversation record", () => {
		expect(lastReply("User: a\n\nAssistant: first\n\nUser: b", "harness")).toBe(
			"first",
		);
	});

	test("is the last line on screen for agents without a record", () => {
		expect(lastReply("> working\nall done\n\n", "stream")).toBe("all done");
	});
});
