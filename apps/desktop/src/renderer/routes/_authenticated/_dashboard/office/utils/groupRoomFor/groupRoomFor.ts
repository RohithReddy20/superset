import type { Room } from "../../types";

/** The person's private chat with exactly these AI teammates, if it exists yet. */
export function groupRoomFor(
	rooms: Room[],
	personId: string | null,
	memberIds: string[],
): Room | null {
	if (!personId || memberIds.length === 0) return null;
	const wanted = [personId, ...memberIds].sort().join(" ");
	return (
		rooms.find(
			(r) => r.kind === "dm" && [...r.members].sort().join(" ") === wanted,
		) ?? null
	);
}
