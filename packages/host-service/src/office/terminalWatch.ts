const CHECK_EVERY_MS = 10_000;

/**
 * Which agent terminals stopped while their agent still looks live. The host only notices that
 * minutes after a restart. A terminal counts as gone after it is missing on two checks in a row,
 * so a terminal service that is still starting is not taken for a dead one.
 */
export class TerminalWatch {
	private missing = new Map<string, { since: number; times: number }>();
	private checkedAt = Number.NEGATIVE_INFINITY;
	private checking: Promise<void> | null = null;
	private readonly now: () => number;

	constructor(
		private readonly deps: {
			/** Terminals that still run, or null when that cannot be told now. */
			aliveIds: () => Promise<Set<string> | null>;
			everyMs?: number;
			now?: () => number;
		},
	) {
		this.now = deps.now ?? Date.now;
	}

	/** When the terminal was first seen missing, once it was missing twice in a row. */
	goneSince(terminalId: string): number | undefined {
		const entry = this.missing.get(terminalId);
		return entry && entry.times >= 2 ? entry.since : undefined;
	}

	/** Checks `terminalIds` again when the last check is older than the interval. */
	refresh(terminalIds: string[]): Promise<void> {
		if (this.checking) return this.checking;
		if (this.now() - this.checkedAt < (this.deps.everyMs ?? CHECK_EVERY_MS))
			return Promise.resolve();
		this.checking = this.check(terminalIds).finally(() => {
			this.checking = null;
		});
		return this.checking;
	}

	private async check(terminalIds: string[]): Promise<void> {
		this.checkedAt = this.now();
		const alive = await this.deps.aliveIds().catch(() => null);
		if (!alive) {
			this.missing.clear();
			return;
		}
		const next = new Map<string, { since: number; times: number }>();
		for (const id of terminalIds) {
			if (alive.has(id)) continue;
			const before = this.missing.get(id);
			next.set(
				id,
				before
					? { since: before.since, times: before.times + 1 }
					: { since: this.checkedAt, times: 1 },
			);
		}
		this.missing = next;
	}
}
