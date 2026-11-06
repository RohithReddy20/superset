import { describe, expect, test } from "bun:test";
import type { Room } from "../../types";
import { groupRoomFor } from "./groupRoomFor";

const room = (id: string, kind: Room["kind"], members: string[]) =>
	({ id, name: id, kind, members }) as Room;

describe("groupRoomFor", () => {
	test("finds the private chat with exactly the person and the picked teammates", () => {
		const rooms = [
			room("design", "room", ["you", "scout", "bash"]),
			room("group-bash", "dm", ["you", "bash"]),
			room("group-bash+scout", "dm", ["you", "scout", "bash"]),
		];
		expect(groupRoomFor(rooms, "you", ["bash", "scout"])?.id).toBe(
			"group-bash+scout",
		);
		expect(groupRoomFor(rooms, "you", ["bash"])?.id).toBe("group-bash");
		expect(groupRoomFor(rooms, "you", ["ledger"])).toBeNull();
	});
});
