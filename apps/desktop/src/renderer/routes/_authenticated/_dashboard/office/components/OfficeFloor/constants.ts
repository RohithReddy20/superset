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
