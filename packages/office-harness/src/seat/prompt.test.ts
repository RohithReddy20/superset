import { describe, expect, test } from "bun:test";
import { fallbackReply } from "./prompt";

describe("fallbackReply", () => {
	test("posts a plain answer and keeps quiet on the no-reply marker", () => {
		expect(fallbackReply("  ok\n")).toBe("ok");
		expect(fallbackReply("Nothing needed here.\nNo reply.")).toBeNull();
		expect(fallbackReply("no reply")).toBeNull();
		expect(fallbackReply("   ")).toBeNull();
	});
});
