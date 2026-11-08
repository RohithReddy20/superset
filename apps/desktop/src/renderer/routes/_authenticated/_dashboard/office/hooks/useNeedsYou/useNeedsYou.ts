import { useMemo } from "react";
import { useCity } from "../../city/hooks/useCity";
import { type NeedsYouItem, needsYou } from "../../utils/needsYou";
import { useOffice } from "../useOffice";

/** What waits on the person across the city and the office, most urgent first. */
export function useNeedsYou(): NeedsYouItem[] {
	const { projects, handovers } = useCity();
	const { state } = useOffice();
	const tasks = state.data?.tasks;
	return useMemo(
		() => needsYou({ projects, handovers, tasks }),
		[projects, handovers, tasks],
	);
}
