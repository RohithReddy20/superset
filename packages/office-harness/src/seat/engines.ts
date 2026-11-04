import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { EngineId } from "../office/types";

export interface EngineLaunch {
	command: string;
	args: string[];
	env: NodeJS.ProcessEnv;
}

export interface EngineSpec {
	id: EngineId;
	label: string;
	/** The agent's own id for its unrestricted mode, when it has one. */
	fullAccessModeId?: string;
	launch(input: { model?: string; extraArgs?: string[] }): EngineLaunch;
}

function adapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

function which(binary: string): string {
	const found = Bun.which(binary);
	if (!found) throw new Error(`${binary} is not on PATH`);
	return found;
}

const base = (): NodeJS.ProcessEnv => ({
	...process.env,
	ELECTRON_RUN_AS_NODE: "1",
});

export const ENGINES: Record<EngineId, EngineSpec> = {
	claude: {
		id: "claude",
		label: "Claude Code",
		fullAccessModeId: "bypassPermissions",
		launch: ({ model, extraArgs = [] }) => ({
			command: process.execPath,
			args: [
				adapterEntry("@agentclientprotocol/claude-agent-acp"),
				...extraArgs,
			],
			env: {
				...base(),
				CLAUDE_CODE_EXECUTABLE: which("claude"),
				...(model ? { ANTHROPIC_MODEL: model } : {}),
			},
		}),
	},
	codex: {
		id: "codex",
		label: "Codex",
		fullAccessModeId: "agent-full-access",
		launch: ({ extraArgs = [] }) => ({
			command: process.execPath,
			args: [adapterEntry("@agentclientprotocol/codex-acp"), ...extraArgs],
			env: { ...base(), CODEX_PATH: which("codex") },
		}),
	},
	agy: {
		id: "agy",
		label: "Antigravity",
		launch: ({ model, extraArgs = [] }) => ({
			command: which("agy"),
			args: [
				"--dangerously-skip-permissions",
				...(model ? ["--model", model] : []),
				...extraArgs,
				"acp",
			],
			env: base(),
		}),
	},
};
