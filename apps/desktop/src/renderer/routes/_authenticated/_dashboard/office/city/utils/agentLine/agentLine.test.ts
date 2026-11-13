import { describe, expect, it } from "bun:test";
import { YOU } from "../../types";
import { agentLine } from "./agentLine";

const kai = { terminalId: "kai", status: "working" as const };
const todo = (over: Record<string, unknown>) => ({
	ownerId: "kai",
	ownerName: "Kai",
	text: "rewrite the page",
	state: "open" as const,
	createdAt: 10,
	...over,
});

describe("agentLine", () => {
	it("puts what the agent needs from you before its work", () => {
		const todos = [todo({ state: "doing" })];
		expect(agentLine({ ...kai, status: "permission" }, todos, [])).toEqual({
			text: "Needs your OK",
			tone: "needsYou",
		});
		expect(
			agentLine(
				kai,
				[
					...todos,
					todo({ ownerId: YOU, askedById: "kai", text: "which colour?" }),
				],
				[],
			),
		).toEqual({ text: "Asks you: which colour?", tone: "needsYou" });
	});

	it("waits on a teammate until that teammate writes back", () => {
		const todos = [
			todo({
				ownerId: "juno",
				ownerName: "Juno",
				askedById: "kai",
				text: "check the numbers",
			}),
			todo({ state: "doing" }),
		];
		expect(agentLine(kai, todos, [])).toEqual({
			text: "Waiting on Juno: check the numbers",
			tone: "waiting",
		});
		const early = { fromId: "juno", toIds: ["kai"], at: 5 };
		expect(agentLine(kai, todos, [early]).tone).toBe("waiting");
		const answer = { fromId: "juno", toIds: ["kai"], at: 20 };
		expect(agentLine(kai, todos, [answer])).toEqual({
			text: "rewrite the page",
			tone: "doing",
		});
	});

	it("falls back to its state, then the next item on its list", () => {
		expect(agentLine(kai, [], []).text).toBe("Working");
		expect(agentLine({ ...kai, status: "review" }, [], []).tone).toBe("done");
		expect(agentLine({ ...kai, status: "idle" }, [todo({})], []).text).toBe(
			"Next: rewrite the page",
		);
		expect(agentLine({ ...kai, status: "idle" }, [], []).text).toBe("Idle");
	});
});
