import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type InboxItem, Office } from "@superset/office-harness";
import { type OfficeGuestInfo, OfficeGuests } from "./officeGuests";

const guest: OfficeGuestInfo = {
	terminalId: "abcdef12-0000",
	workspaceId: "w1",
	agentId: "claude",
	name: "Ada",
	label: "Claude",
	workspaceName: "Check health",
	projectName: "city-demo-api",
	roomId: "eng",
};

function setup() {
	const office = new Office({
		statePath: join(mkdtempSync(join(tmpdir(), "guests-")), "state.json"),
	});
	office.upsertTeammate({
		id: "me",
		name: "Rohith",
		kind: "human",
		role: "lead",
		roomId: "eng",
	});
	office.upsertTeammate({
		id: "scout",
		name: "Scout",
		kind: "ai",
		role: "researcher",
		roomId: "eng",
	});
	const base = ["me", "scout"];
	office.upsertRoom({
		id: "eng",
		name: "engineering",
		kind: "room",
		members: base,
	});
	const sent: string[] = [];
	const scoutInbox: InboxItem[] = [];
	office.onInbox("scout", (item) => scoutInbox.push(item));
	const guests: OfficeGuests = new OfficeGuests({
		office,
		send: async (_info, text) => {
			sent.push(text);
		},
		onRoomsChanged: () =>
			office.upsertRoom({
				id: "eng",
				name: "engineering",
				kind: "room",
				members: [...base, ...guests.membersOf("eng")],
			}),
	});
	return { office, guests, sent, scoutInbox };
}

describe("OfficeGuests", () => {
	test("guests left over from an earlier run are taken out", () => {
		const { office, guests } = setup();
		office.upsertTeammate({
			id: "cli-oldold00",
			name: "claude-old",
			kind: "ai",
			role: "CLI",
			roomId: "eng",
		});
		guests.sync([guest]);
		expect(office.teammate("cli-oldold00")).toBeUndefined();
		expect(office.teammate(guests.idOf(guest.terminalId))).toBeDefined();
	});

	test("a CLI joins a room as a teammate with a name people can @mention", () => {
		const { office, guests } = setup();
		guests.sync([guest]);
		const id = guests.idOf(guest.terminalId);
		expect(office.room("eng")?.members).toContain(id);
		expect(office.teammate(id)?.name).toBe("Ada");
		expect(office.teammate(id)?.role).toContain('working in "Check health"');
	});

	test("hears an @mention in its terminal, and its answer lands in the thread where Scout hears it", async () => {
		const { office, guests, sent, scoutInbox } = setup();
		guests.sync([guest]);
		const { message } = office.post({
			authorId: "me",
			roomId: "eng",
			text: "@Ada which files are in your folder?",
		});
		await Promise.resolve();
		expect(sent).toHaveLength(1);
		expect(sent[0]).toContain("You are @Ada in the office room #engineering");
		expect(sent[0]).toContain("@Scout (researcher)");
		expect(sent[0]).toContain("which files are in your folder?");
		expect(sent[0]).toContain("Rohith (a person) mentioned you");
		await guests.turnEnded(
			guest.terminalId,
			"README.md and server.js. @Scout can you check them?",
		);
		const reply = office.thread("eng", message.id).at(-1);
		expect(reply?.authorId).toBe(guests.idOf(guest.terminalId));
		expect(reply?.threadId).toBe(message.id);
		expect(scoutInbox.at(-1)?.reason).toBe("mention");
		expect(office.teammate(guests.idOf(guest.terminalId))?.presence).toBe(
			"in-office",
		);
	});

	test('"no reply" posts nothing, and leaving takes it out of the room', async () => {
		const { office, guests } = setup();
		guests.sync([guest]);
		const { message } = office.post({
			authorId: "me",
			roomId: "eng",
			text: "@Ada thanks",
		});
		await Promise.resolve();
		await guests.turnEnded(guest.terminalId, "no reply");
		expect(office.thread("eng", message.id)).toHaveLength(1);
		guests.sync([]);
		expect(office.room("eng")?.members).not.toContain(
			guests.idOf(guest.terminalId),
		);
		expect(office.teammate(guests.idOf(guest.terminalId))).toBeUndefined();
	});
});
