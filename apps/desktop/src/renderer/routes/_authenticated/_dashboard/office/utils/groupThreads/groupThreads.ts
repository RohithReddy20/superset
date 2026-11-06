import type { Message, Teammate } from "../../types";

export interface GroupThread {
	roomId: string;
	members: string[];
	/** The person's latest root message in the room that mentions exactly these members. */
	rootId: string | null;
}

/** Where a conversation with a group lives: one thread per room the group sits in. */
export function groupThreads(
	messages: Message[],
	personId: string | null,
	group: Teammate[],
): GroupThread[] {
	const byRoom = new Map<string, string[]>();
	for (const t of group)
		byRoom.set(t.roomId, [...(byRoom.get(t.roomId) ?? []), t.id]);
	return [...byRoom].map(([roomId, members]) => {
		const wanted = [...members].sort().join(" ");
		const root = messages.findLast(
			(m) =>
				m.roomId === roomId &&
				m.threadId === null &&
				m.authorId === personId &&
				[...m.mentions].sort().join(" ") === wanted,
		);
		return { roomId, members, rootId: root?.id ?? null };
	});
}
