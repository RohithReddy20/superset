export interface ScreenAsk {
	question: string;
	options: string[];
	/** The option the cursor is on; Enter picks it. */
	selected: number;
	/** The CLI asks whether to trust the folder it was started in. */
	trust: boolean;
}

const LOOK_BACK_LINES = 40;
const QUESTION_LOOK_BACK = 14;
const POINTER = /^\s*[❯›>]\s+/;
const NUMBERED = /^\s*(?:[❯›>]\s+)?\d+\.\s+/;
const MENU_FOOTER =
	/enter to (?:confirm|continue|select)|enter continue|esc (?:to )?(?:cancel|skip)/i;

/**
 * A question a CLI shows on its screen with options to pick, read off the bottom of the screen:
 * a block of option lines with one under the cursor, numbered or above a menu footer.
 */
export function screenAsk(screen: string): ScreenAsk | null {
	const lines = screen
		.split("\n")
		.map((line) => line.trimEnd())
		.slice(-LOOK_BACK_LINES);
	let end = lastIndex(lines, (line) => MENU_FOOTER.test(line));
	const hasFooter = end >= 0;
	if (!hasFooter) end = lines.length;

	let last = end - 1;
	while (last >= 0 && !lines[last]?.trim()) last--;
	let first = last;
	while (first > 0 && lines[first - 1]?.trim()) first--;
	if (last < 0) return null;

	const numbered = lines
		.slice(first, last + 1)
		.some((line) => NUMBERED.test(line));
	if (!numbered && !hasFooter) return null;
	if (numbered)
		while (first < last && !NUMBERED.test(lines[first] ?? "")) first++;
	const block = lines.slice(first, last + 1);
	const options: string[] = [];
	let selected = -1;
	for (const line of block) {
		const isOption = numbered ? NUMBERED.test(line) : true;
		if (!isOption) {
			if (options.length === 0) return null;
			options[options.length - 1] += ` ${line.trim()}`;
			continue;
		}
		if (POINTER.test(line)) {
			if (selected >= 0) return null;
			selected = options.length;
		}
		options.push(
			line
				.replace(POINTER, "")
				.replace(/^\s*\d+\.\s+/, "")
				.trim(),
		);
	}
	if (options.length < 2 || selected < 0) return null;

	const question = questionAbove(lines, first);
	return {
		question,
		options,
		selected,
		trust: /\btrust/i.test([question, ...options].join(" ")),
	};
}

/** Arrow presses from the cursor to `target`, then Enter. */
export function keysToChoose(
	ask: Pick<ScreenAsk, "selected">,
	target: number,
): Array<"up" | "down" | "enter"> {
	const steps = target - ask.selected;
	const arrow = steps > 0 ? "down" : "up";
	return [
		...Array.from({ length: Math.abs(steps) }, () => arrow),
		"enter" as const,
	];
}

/** The nearest line above the options that asks something, else the paragraph just above them. */
function questionAbove(lines: string[], optionsStart: number): string {
	const from = Math.max(0, optionsStart - QUESTION_LOOK_BACK);
	for (let i = optionsStart - 1; i >= from; i--) {
		const line = lines[i]?.trim() ?? "";
		const mark = line.indexOf("?");
		if (mark >= 0) return line.slice(0, mark + 1);
	}
	let i = optionsStart - 1;
	while (i >= 0 && !lines[i]?.trim()) i--;
	while (i > 0 && lines[i - 1]?.trim()) i--;
	return lines[i]?.trim() ?? "";
}

function lastIndex(lines: string[], test: (line: string) => boolean): number {
	for (let i = lines.length - 1; i >= 0; i--)
		if (test(lines[i] ?? "")) return i;
	return -1;
}
