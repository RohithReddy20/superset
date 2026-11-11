import type { Teammate } from "../office/types";

export type GuardVerdict = { ok: true } | { ok: false; reason: string };

export function checkDelivery(target: Teammate): GuardVerdict {
	if (target.paused) return { ok: false, reason: `${target.name} is paused` };
	return { ok: true };
}
