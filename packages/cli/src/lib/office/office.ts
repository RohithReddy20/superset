import { CLIError } from "@superset/cli-framework";
import { callHost, hostClient } from "../settings/host-settings";

type OfficeClient = ReturnType<typeof hostClient>["office"];

const REFUSALS = new Set(["BAD_REQUEST", "PRECONDITION_FAILED"]);

function refusal(error: unknown): string | null {
	const code = (error as { data?: { code?: string } } | null)?.data?.code;
	return code && REFUSALS.has(code) ? (error as Error).message : null;
}

/** The terminal this command runs in; the host takes anything else as the person. */
export function officeCaller(): string | undefined {
	return process.env.SUPERSET_TERMINAL_ID || undefined;
}

/** Calls this machine's office; what the office refuses is shown in its own words. */
export function office<T>(
	run: (office: OfficeClient) => Promise<T>,
): Promise<T> {
	return callHost(async () => {
		try {
			return await run(hostClient().office);
		} catch (error) {
			const message = refusal(error);
			if (message) throw new CLIError(message);
			throw error;
		}
	});
}

export function handles(value: string): string[] {
	return value
		.split(/[\s,]+/)
		.map((h) => h.trim())
		.filter(Boolean);
}
