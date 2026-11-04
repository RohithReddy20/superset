import { accessSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
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

export function adapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

export function whichOnPath(
	binary: string,
	env: NodeJS.ProcessEnv = process.env,
): string {
	for (const dir of (env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		const candidate = join(dir, binary);
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {}
	}
	throw new Error(`${binary} is not on PATH`);
}

const which = (binary: string) => whichOnPath(binary);

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
