const STALE_MODULE = /dynamically imported module|module script failed/i;
const WINDOW_MS = 60_000;
const MAX_RELOADS = 3;

/**
 * A view whose code changed on disk while the app was open fails to load. Returns the reload times
 * to store when one more automatic reload is allowed, else null.
 */
export function staleModuleReload(
	error: unknown,
	now: number,
	past: number[],
): number[] | null {
	const message = error instanceof Error ? error.message : String(error);
	if (!STALE_MODULE.test(message)) return null;
	const recent = past.filter((at) => now - at < WINDOW_MS);
	return recent.length < MAX_RELOADS ? [...recent, now] : null;
}
