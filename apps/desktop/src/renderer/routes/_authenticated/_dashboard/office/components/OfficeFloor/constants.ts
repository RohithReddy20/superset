import type { EngineId } from "../../types";

export const ENGINE_COLORS: Record<EngineId | "human", string> = {
	claude: "#f28c28",
	codex: "#ec5fa3",
	agy: "#2fc7b5",
	human: "#8f9bb3",
};

export function engineLabel(engine: EngineId | undefined): string {
	switch (engine) {
		case "claude":
			return "Claude";
		case "codex":
			return "Codex";
		case "agy":
			return "Gemini";
		default:
			return "";
	}
}

export const OFFICE_CONTROLS: Array<[string, string]> = [
	["Click a teammate", "Chat with them"],
	["Shift-click or Shift-drag", "Pick several to chat with at once"],
	["Drag a teammate", "Move them to another room"],
	["Click a room", "Show its talk on the right"],
	["Drag the floor", "Look around"],
	["Scroll, or − and +", "Zoom"],
	["Arrow keys", "Walk"],
	["Esc", "Clear the pick"],
];
