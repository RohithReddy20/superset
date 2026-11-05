import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Office } from "./Office";

function office(leadId?: string) {
	const dir = mkdtempSync(join(tmpdir(), "office-"));
	const o = new Office({
		statePath: join(dir, "state.json"),
		leadId,
		maxTaskRounds: 2,
	});
	o.upsertTeammate({
		id: "you",
		name: "You",
		kind: "human",
		role: "founder",
		roomId: "eng",
	});
	o.upsertTeammate({
		id: "lead",
		name: "Lead",
		kind: "ai",
		role: "lead",
		roomId: "eng",
		engine: "claude",
	});
	o.upsertTeammate({
		id: "bash",
		name: "Bash",
		kind: "ai",
		role: "coder",
		roomId: "eng",
		engine: "codex",
	});
	o.upsertTeammate({
		id: "scout",
		name: "Scout",
		kind: "ai",
		role: "reviewer",
		roomId: "eng",
		engine: "claude",
	});
	o.upsertRoom({
		id: "eng",
		name: "engineering",
		kind: "room",
		members: ["you", "lead", "bash", "scout"],
	});
	return o;
}

describe("tasks", () => {
	test("a task opens its own thread and the owner, verifier and lead each move it as allowed", () => {
		const o = office("lead");
		const task = o.createTask({
			title: "Add a README line",
			brief: "Append hello",
			by: "you",
			roomId: "eng",
			ownerId: "bash",
		});
		expect(task.id).toBe("T-1");
		expect(o.message(task.threadId)?.text).toBe("T-1: Add a README line");
		expect(task.ownerId).toBe("bash");
		expect(task.status).toBe("todo");

		expect(() =>
			o.updateTask("T-1", { status: "done", note: "no" }, "bash"),
		).toThrow(/may not move/);
		o.updateTask("T-1", { status: "doing", note: "on it" }, "bash");
		o.updateTask(
			"T-1",
			{ status: "review", note: "appended, tests pass" },
			"bash",
		);

		o.setTaskVerifier("T-1", "scout");
		expect(() =>
			o.updateTask("T-1", { status: "done", note: "ship" }, "scout"),
		).toThrow(/may not move/);
		o.updateTask(
			"T-1",
			{ status: "verified", note: "matches the brief" },
			"scout",
		);
		expect(o.task("T-1")?.status).toBe("verified");

		o.updateTask("T-1", { status: "done", note: "closing" }, "lead");
		expect(o.task("T-1")?.status).toBe("done");
		expect(
			o.thread("eng", task.threadId).filter((m) => m.kind === "system"),
		).toHaveLength(6);
	});

	test("only a person, the lead or the creator of an unowned task may assign", () => {
		const o = office();
		const task = o.createTask({
			title: "x",
			brief: "y",
			by: "scout",
			roomId: "eng",
		});
		o.assignTask(task.id, "bash", "scout");
		expect(() => o.assignTask(task.id, "scout", "scout")).toThrow(
			/may not assign/,
		);
		o.assignTask(task.id, "scout", "you");
		expect(o.task(task.id)?.ownerId).toBe("scout");
	});

	test("a verifier can only verify a task that is in review, and rounds run out", () => {
		const o = office();
		const task = o.createTask({
			title: "x",
			brief: "y",
			by: "you",
			roomId: "eng",
			ownerId: "bash",
			verifierId: "scout",
		});
		expect(() =>
			o.updateTask(task.id, { status: "verified", note: "ok" }, "scout"),
		).toThrow(/not in review/);
		expect(o.spendTaskRound(task.id)).toBe(true);
		expect(o.spendTaskRound(task.id)).toBe(true);
		expect(o.spendTaskRound(task.id)).toBe(false);
	});
});
