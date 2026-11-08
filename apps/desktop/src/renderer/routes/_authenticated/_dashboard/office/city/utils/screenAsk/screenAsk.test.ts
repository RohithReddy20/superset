import { describe, expect, test } from "bun:test";
import { keysToChoose, screenAsk } from "./screenAsk";

const CLAUDE_TRUST = `
────────────────────────────────────────────────────────────
 Accessing workspace:

 /tmp/trust-probe/claude

 Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source
 project, or work from your team). If not, take a moment to review what's in this folder first.

 Claude Code'll be able to read, edit, and execute files here.

 Security guide

 ❯ No, exit
   Yes, I trust this folder

 Enter to confirm · Esc to cancel`;

const CODEX_UPDATE = `
  Update available · 0.164.0 → 0.167.0
  Release notes: https://github.com/openai/codex/releases/latest

› 1. Update now (runs \`sh -c 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'\`)
  2. Skip
  3. Skip until next version

  enter continue · esc skip`;

const CLAUDE_PERMISSION = `
 Bash command

   rm -rf build
   Remove the build folder

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don't ask again for rm commands in /tmp/app
   3. No, and tell Claude what to do differently (esc)
`;

const CLAUDE_IDLE = `
⏺ I'm Bolt (@bolt), a Claude agent in workspace "Add health check" on city-demo-api.

✻ Brewed for 3s · done 9:57 PM

────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────
  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← 3 agents`;

describe("screenAsk", () => {
	test("reads Claude's trust question, whose cursor starts on No", () => {
		expect(screenAsk(CLAUDE_TRUST)).toEqual({
			question:
				"Quick safety check: Is this a project you created or one you trust?",
			options: ["No, exit", "Yes, I trust this folder"],
			selected: 0,
			trust: true,
		});
	});

	test("reads a numbered menu above a footer", () => {
		const ask = screenAsk(CODEX_UPDATE);
		expect(ask?.question).toBe("Update available · 0.164.0 → 0.167.0");
		expect(ask?.options.slice(1)).toEqual(["Skip", "Skip until next version"]);
		expect(ask?.selected).toBe(0);
		expect(ask?.trust).toBe(false);
	});

	test("reads a numbered permission question with no footer", () => {
		const ask = screenAsk(CLAUDE_PERMISSION);
		expect(ask?.question).toBe("Do you want to proceed?");
		expect(ask?.options).toHaveLength(3);
	});

	test("sees no question on an agent waiting at its prompt", () => {
		expect(screenAsk(CLAUDE_IDLE)).toBeNull();
	});
});

describe("keysToChoose", () => {
	test("moves the cursor to the option, then presses Enter", () => {
		expect(keysToChoose({ selected: 0 }, 1)).toEqual(["down", "enter"]);
		expect(keysToChoose({ selected: 2 }, 0)).toEqual(["up", "up", "enter"]);
		expect(keysToChoose({ selected: 1 }, 1)).toEqual(["enter"]);
	});
});
