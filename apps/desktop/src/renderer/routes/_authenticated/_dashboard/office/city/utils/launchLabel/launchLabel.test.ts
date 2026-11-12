import { expect, test } from "bun:test";
import { launchLabel } from "./launchLabel";

test("names the model and effort as the pickers do, and nothing for the CLI's defaults", () => {
	expect(
		launchLabel({ agentId: "claude", model: "opus", effort: "xhigh" }),
	).toBe("Opus, xHigh effort");
	expect(launchLabel({ agentId: "claude", model: "some-new-id" })).toBe(
		"some-new-id",
	);
	expect(launchLabel({ agentId: "claude" })).toBe("");
});
