import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../db";
import { OfficeRuntime } from "./officeRuntime";
import type { OfficeConfig } from "./types";

function runtime() {
	const homeDir = mkdtempSync(join(tmpdir(), "office-runtime-"));
	const config: OfficeConfig = {
		rooms: [
			{ id: "engineering", name: "engineering", members: ["you", "ledger"] },
			{ id: "planning", name: "planning", members: ["you", "scout", "bash"] },
			{
				id: "design",
				name: "Design",
				kind: "room",
				members: ["you", "scout", "bash"],
			},
		],
		humans: [{ id: "you", name: "You", role: "founder", room: "engineering" }],
		seats: [
			{
				id: "scout",
				name: "Scout",
				role: "research",
				room: "design",
				engine: "claude",
			},
			{
				id: "bash",
				name: "Bash",
				role: "code",
				room: "design",
				engine: "codex",
			},
			{
				id: "ledger",
				name: "Ledger",
				role: "numbers",
				room: "engineering",
				engine: "agy",
			},
		],
	};
	writeFileSync(join(homeDir, "office.json"), JSON.stringify(config));
	const office = new OfficeRuntime({
		db: {} as HostDb,
		homeDir,
		baseUrl: () => "http://127.0.0.1:0",
	});
	const saved = () =>
		JSON.parse(
			readFileSync(join(homeDir, "office.json"), "utf8"),
		) as OfficeConfig;
	const members = (roomId: string) =>
		office.snapshot().rooms.find((r) => r.id === roomId)?.members;
	const home = (id: string) =>
		office.snapshot().teammates.find((t) => t.id === id)?.roomId;
	return { office, saved, members, home };
}

describe("OfficeRuntime", () => {
	test("moving a teammate changes only its home room and keeps its other rooms", () => {
		const { office, saved, members, home } = runtime();
		office.moveTeammate("scout", "planning");
		office.moveTeammate("scout", "design");
		office.moveTeammate("ledger", "design");

		expect(home("scout")).toBe("design");
		expect(members("planning")).toContain("scout");
		expect(home("ledger")).toBe("design");
		expect(members("engineering")).toContain("ledger");
		expect(members("design")).toContain("ledger");
		const config = saved();
		expect(config.seats.find((s) => s.id === "scout")?.room).toBe("design");
		expect(config.rooms.find((r) => r.id === "planning")?.members).toContain(
			"scout",
		);
	});

	test("deleting a room removes it from office.json and moves who lived there", () => {
		const { office, saved, members, home } = runtime();
		office.moveTeammate("ledger", "design");
		office.deleteRoom("design");

		expect(members("design")).toBeUndefined();
		expect(home("scout")).toBe("planning");
		expect(home("ledger")).toBe("engineering");
		const config = saved();
		expect(config.rooms.map((r) => r.id)).toEqual(["engineering", "planning"]);
		expect(config.seats.map((s) => [s.id, s.room])).toEqual([
			["scout", "planning"],
			["bash", "planning"],
			["ledger", "engineering"],
		]);
	});

	test("a teammate's desk is kept when the office config changes", () => {
		const { office } = runtime();
		office.setDesks([{ id: "bash", zoneId: "pod-2", x: 40, y: 100 }]);
		office.moveTeammate("bash", "planning");
		expect(
			office.snapshot().teammates.find((t) => t.id === "bash")?.desk,
		).toEqual({ zoneId: "pod-2", x: 40, y: 100 });
	});
});
