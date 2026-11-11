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

	test("drops the wrapper a CLI puts around a pasted message", () => {
		const text =
			'User: <pasted_content id="ef0a">\n[office] The person asks you:\nList the files.\n</pasted_content id="ef0a">\n\nAssistant: Done.';
		expect(parseTurns(text)).toEqual([
			{ who: "you", text: "[office] The person asks you:\nList the files." },
			{ who: "agent", text: "Done." },
		]);
	});

	test("what the office typed itself is its own kind of turn, without its tag", () => {
		expect(
			parseTurns("User: [Paradev office] You are Iris.\n\nUser: hello"),
		).toEqual([
			{ who: "office", text: "You are Iris." },
			{ who: "you", text: "hello" },
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
