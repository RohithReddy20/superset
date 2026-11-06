import { describe, expect, test } from "bun:test";
import type { Message, Teammate } from "../../types";
import { groupThreads } from "./groupThreads";

const mate = (id: string, roomId: string) => ({ id, roomId }) as Teammate;
const message = (m: Partial<Message> & { id: string }) =>
	({
		roomId: "design",
		threadId: null,
		authorId: "you",
		text: "",
		mentions: [],
		kind: "chat",
		depth: 0,
		ts: 0,
		...m,
	}) as Message;

describe("groupThreads", () => {
	test("reuses the person's latest root that mentions exactly the group, per room", () => {
		const messages = [
			message({ id: "a", mentions: ["scout", "bash"] }),
			message({ id: "b", mentions: ["scout"] }),
			message({ id: "c", mentions: ["bash", "scout"] }),
			message({ id: "d", mentions: ["bash", "scout"], authorId: "scout" }),
			message({ id: "e", mentions: ["bash", "scout"], threadId: "a" }),
		];
		const group = [
			mate("scout", "design"),
			mate("bash", "design"),
			mate("ledger", "ops"),
		];
		expect(groupThreads(messages, "you", group)).toEqual([
			{ roomId: "design", members: ["scout", "bash"], rootId: "c" },
			{ roomId: "ops", members: ["ledger"], rootId: null },
		]);
	});
});
