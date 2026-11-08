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

function officeWithDesign() {
	const o = office();
	o.upsertRoom({
		id: "eng",
		name: "engineering",
		kind: "room",
		members: ["you", "lead"],
	});
	o.upsertRoom({
		id: "design",
		name: "design",
		kind: "room",
		members: ["you", "bash", "scout"],
	});
	o.upsertRoom({
		id: "planning",
		name: "planning",
		kind: "room",
		members: ["you", "scout"],
	});
	o.upsertRoom({
		id: "group-bash+scout",
		name: "Bash, Scout",
		kind: "dm",
		members: ["you", "bash", "scout"],
	});
	o.upsertTeammate({
		id: "bash",
		name: "Bash",
		kind: "ai",
		role: "coder",
		roomId: "design",
	});
	o.upsertTeammate({
		id: "scout",
		name: "Scout",
		kind: "ai",
		role: "reviewer",
		roomId: "design",
	});
	return o;
}

describe("rooms", () => {
	test("deleting a room moves who lived there to another room they are in, else the first room, and drops its messages", () => {
		const o = officeWithDesign();
		o.post({ authorId: "you", roomId: "design", text: "mockups" });
		o.post({ authorId: "you", roomId: "eng", text: "build" });

		expect(o.removeRoom("design")).toEqual([
			{ teammateId: "bash", roomId: "eng" },
			{ teammateId: "scout", roomId: "planning" },
		]);
		expect(o.room("design")).toBeUndefined();
		expect(o.teammate("bash")?.roomId).toBe("eng");
		expect(o.room("eng")?.members).toContain("bash");
		expect(o.teammate("scout")?.roomId).toBe("planning");
		expect(o.snapshot().messages.map((m) => m.text)).toEqual(["build"]);
	});

	test("a group chat, a room holding a task and the last room are not deleted", () => {
		const o = officeWithDesign();
		expect(() => o.removeRoom("group-bash+scout")).toThrow(/group chat/);
		o.createTask({ title: "x", brief: "y", by: "you", roomId: "planning" });
		expect(() => o.removeRoom("planning")).toThrow(/T-1 keeps its thread/);
		o.removeRoom("design");
		o.removeRoom("eng");
		expect(() => o.removeRoom("planning")).toThrow(/last room/);
		expect(o.room("planning")).toBeDefined();
	});
});

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

	test("adds each turn's tokens and reported cost to the teammate's day and the task", () => {
		const o = office();
		const task = o.createTask({
			title: "Count usage",
			brief: "",
			by: "you",
			roomId: "eng",
			ownerId: "bash",
		});
		o.recordUsage("bash", { tokens: 1200, costUsd: null }, task.id);
		expect(o.teammate("bash")?.usage).toEqual({
			tokens: 1200,
			costUsd: 0,
			priced: false,
		});
		o.recordUsage("bash", { tokens: 300, costUsd: 0.02 }, task.id);
		o.recordUsage("bash", { tokens: 100, costUsd: 0.01 });
		expect(o.teammate("bash")?.usage).toEqual({
			tokens: 1600,
			costUsd: 0.03,
			priced: true,
		});
		expect(o.task(task.id)?.usage).toEqual({
			tokens: 1500,
			costUsd: 0.02,
			priced: true,
		});
	});
});
