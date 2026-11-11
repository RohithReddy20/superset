export interface Turn {
	/** "office" is what the office typed into the agent itself: who it is, what a teammate wrote. */
	who: "you" | "agent" | "office";
	text: string;
}

const TURN = /(?:^|\n\n)(User|Assistant): /g;
/** The wrapper a CLI puts around text that was pasted into it; the text inside is what was said. */
const OFFICE_TAG = "[Paradev office]";
const PASTE_TAG = /<\/?pasted_content\b[^>\n]*>\n?/g;

/**
 * Splits an agent's own conversation record ("User: …" and "Assistant: …" turns, blank lines
 * between) into turns. Text before the first marker is the tail of a turn the record cut off.
 */
export function parseTurns(text: string): Turn[] {
	const turns: Turn[] = [];
	const marks = [...text.matchAll(TURN)];
	const head = text.slice(0, marks[0]?.index ?? text.length).trim();
	if (head) turns.push({ who: "agent", text: head });
	marks.forEach((mark, i) => {
		const start = (mark.index ?? 0) + mark[0].length;
		const end = marks[i + 1]?.index ?? text.length;
		const body = text.slice(start, end).replace(PASTE_TAG, "").trim();
		if (!body) return;
		if (mark[1] !== "User") turns.push({ who: "agent", text: body });
		else if (body.startsWith(OFFICE_TAG))
			turns.push({
				who: "office",
				text: body.slice(OFFICE_TAG.length).trim(),
			});
		else turns.push({ who: "you", text: body });
	});
	return turns;
}

/** The agent's latest words: its last turn in a conversation record, else the last line of its screen. */
export function lastReply(
	text: string,
	source: "harness" | "stream" | "screen",
): string {
	if (source === "harness")
		return parseTurns(text).findLast((t) => t.who === "agent")?.text ?? "";
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	return lines.at(-1) ?? "";
}
