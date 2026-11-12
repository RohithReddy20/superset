import { type CityNote, type CityPlace, YOU } from "../../types";

/**
 * What was said in a room: written to the room, or between people who all sit there. The person
 * sits nowhere, so what they and someone in the room wrote to each other counts too.
 */
export function roomTalk(
	notes: CityNote[],
	place: CityPlace,
	sitting: ReadonlySet<string>,
): CityNote[] {
	return notes.filter((note) => {
		if (note.room)
			return (
				note.room.projectId === place.projectId &&
				note.room.roomId === place.roomId
			);
		const parties = [note.fromId, ...note.toIds];
		return (
			parties.some((id) => sitting.has(id)) &&
			parties.every((id) => id === YOU || sitting.has(id))
		);
	});
}
