import { formatCompactNumber, formatCurrency } from "@superset/i18n/format";

interface Usage {
	tokens: number;
	costUsd: number;
	priced: boolean;
}

/** "12K tokens · $0.21"; the price is left out while no engine has reported one. */
export function formatUsage(usage: Usage): string {
	const tokens = `${formatCompactNumber(usage.tokens)} tokens`;
	if (!usage.priced) return tokens;
	const cost =
		usage.costUsd > 0 && usage.costUsd < 0.01
			? `<${formatCurrency(0.01)}`
			: formatCurrency(usage.costUsd);
	return `${tokens} · ${cost}`;
}
