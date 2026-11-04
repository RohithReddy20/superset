import type { Message, Teammate } from "../office/types";

export interface Limits {
	/** Hops away from the person who started the chain: ask, answer, one follow-up. */
	maxDepth: number;
	/** AI posts in one thread since the last human post before the thread waits for a person. */
	maxAiRoundsWithoutHuman: number;
	/** Teammates one AI may pull in during one turn. */
	maxAsksPerTurn: number;
	/** Turns one AI teammate may take per day. */
	dailyTurns: number;
}

export const DEFAULT_LIMITS: Limits = {
	maxDepth: 3,
	maxAiRoundsWithoutHuman: 6,
	maxAsksPerTurn: 3,
	dailyTurns: 60,
};

export type GuardVerdict = { ok: true } | { ok: false; reason: string };

export function checkDelivery({
	limits,
	author,
	target,
	message,
	depth,
	thread,
}: {
	limits: Limits;
	author: Teammate;
	target: Teammate;
	message: Message;
	depth: number;
	thread: Message[];
}): GuardVerdict {
	if (target.paused) return { ok: false, reason: `${target.name} is paused` };
	if (depth > limits.maxDepth) {
		return {
			ok: false,
			reason: `chain too deep (${depth} hops from a person, max ${limits.maxDepth})`,
		};
	}
	if (target.budget.usedToday >= target.budget.dailyTurns) {
		return {
			ok: false,
			reason: `${target.name} has no attention budget left today`,
		};
	}
	if (author.kind !== "ai") return { ok: true };

	const repeated = thread.some(
		(earlier) =>
			earlier.id !== message.id &&
			earlier.authorId === author.id &&
			earlier.mentions.includes(target.id) &&
			earlier.text.trim() === message.text.trim(),
	);
	if (repeated) return { ok: false, reason: "repeated message" };

	let aiRounds = 0;
	for (const earlier of thread) {
		if (earlier.kind !== "chat") continue;
		if (earlier.authorId === author.id && earlier.id === message.id) continue;
		aiRounds = earlier.depth === 0 ? 0 : aiRounds + 1;
	}
	if (aiRounds >= limits.maxAiRoundsWithoutHuman) {
		return {
			ok: false,
			reason: `${aiRounds} AI rounds without a person; waiting for a human`,
		};
	}
	return { ok: true };
}
