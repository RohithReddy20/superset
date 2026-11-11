import { useMemo } from "react";
import { useCity } from "../../city/hooks/useCity";
import { useCityTeam } from "../../city/hooks/useCityTeam";
import { type NeedsYouItem, needsYou } from "../../utils/needsYou";

/** What waits on the person across the city, most urgent first. */
export function useNeedsYou(): NeedsYouItem[] {
	const { projects, handovers } = useCity();
	const { todos, unread } = useCityTeam();
	return useMemo(
		() => needsYou({ projects, handovers, todos, unread }),
		[projects, handovers, todos, unread],
	);
}
