import { useEffect, useState } from "react";

/** How often views that show "2 minutes ago" read the time again. */
export const TICK_MS = 15_000;

/** The time, read again every `everyMs`, so "2 minutes ago" keeps moving while a view stays open. */
export function useNow(everyMs: number): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), everyMs);
		return () => clearInterval(timer);
	}, [everyMs]);
	return now;
}
