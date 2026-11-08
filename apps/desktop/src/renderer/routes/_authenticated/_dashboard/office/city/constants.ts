import type { AgentStatus } from "./types";

export const STATUS_COLORS: Record<AgentStatus, string> = {
	idle: "#8b95a7",
	working: "#f5b942",
	permission: "#ff7a45",
	review: "#39d353",
	failed: "#ff4d4d",
};

/** What a person in the building says about their state; idle people say nothing. */
export const STATUS_LINES: Record<AgentStatus, string> = {
	idle: "",
	working: "Working",
	permission: "Needs your OK",
	review: "Done, take a look",
	failed: "Stopped with an error",
};

export const STATUS_LABELS: Record<AgentStatus, string> = {
	idle: "Idle",
	working: "Working",
	permission: "Needs you",
	review: "Done",
	failed: "Failed",
};
