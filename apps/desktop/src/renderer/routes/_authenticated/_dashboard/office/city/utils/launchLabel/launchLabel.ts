import {
	getAgentEffortSupport,
	getAgentModelSupport,
} from "@superset/shared/agent-models";

/** The model and effort an agent was started with, as the pickers name them; empty for the CLI's defaults. */
export function launchLabel(agent: {
	agentId: string;
	model?: string;
	effort?: string;
}): string {
	const model = agent.model
		? (getAgentModelSupport(agent.agentId)?.models.find(
				(option) => option.id === agent.model,
			)?.label ?? agent.model)
		: null;
	const effort = agent.effort
		? (getAgentEffortSupport(agent.agentId)?.efforts.find(
				(option) => option.id === agent.effort,
			)?.label ?? agent.effort)
		: null;
	return [model, effort ? `${effort} effort` : null].filter(Boolean).join(", ");
}
