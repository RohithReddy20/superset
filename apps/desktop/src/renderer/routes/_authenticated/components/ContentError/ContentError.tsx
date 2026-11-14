import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { HiExclamationTriangle } from "react-icons/hi2";
import { failureDiagnostic } from "renderer/lib/failure-diagnostic/failure-diagnostic";
import { staleModuleReload } from "./utils/staleModuleReload";

const RELOADS_KEY = "content-error:stale-module-reloads";
const RELOAD_DELAY_MS = 1500;

function pastReloads(): number[] {
	try {
		const stored = JSON.parse(sessionStorage.getItem(RELOADS_KEY) ?? "[]");
		return Array.isArray(stored) ? stored.filter(Number.isFinite) : [];
	} catch {
		return [];
	}
}

/** A reload while the dev server is down leaves a blank window that never recovers. */
async function originAnswers(): Promise<boolean> {
	if (!location.protocol.startsWith("http")) return true;
	return fetch(location.href, { method: "HEAD", cache: "no-store" }).then(
		(response) => response.ok,
		() => false,
	);
}

export function ContentError({ error }: ErrorComponentProps) {
	const { t } = useLingui();
	const message =
		error == null ? t({ message: "Unknown error" }) : failureDiagnostic(error);

	useEffect(() => {
		console.error("[content] Content route error caught:", error);
		void import("@sentry/electron/renderer")
			.then((Sentry) => Sentry.captureException(error))
			.catch((reportError) => {
				// Don't let a telemetry failure vanish silently — the fallback UI
				// still renders, but we want the reporting gap to be observable.
				console.error(
					"[content] failed to report content error to Sentry",
					reportError,
				);
			});
	}, [error]);

	useEffect(() => {
		const reloads = staleModuleReload(error, Date.now(), pastReloads());
		if (!reloads) return;
		let cancelled = false;
		const timer = setTimeout(async () => {
			if (!(await originAnswers()) || cancelled) return;
			try {
				sessionStorage.setItem(RELOADS_KEY, JSON.stringify(reloads));
			} catch {}
			window.location.reload();
		}, RELOAD_DELAY_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [error]);

	return (
		<div className="flex h-full min-h-0 min-w-0 w-full overflow-auto bg-background p-4">
			<div className="m-auto flex w-full min-w-0 max-w-md shrink-0 flex-col items-center gap-4">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
					<HiExclamationTriangle className="h-6 w-6 text-destructive" />
				</div>
				<div className="w-full text-center">
					<h2 className="text-base font-semibold">
						<Trans>This view hit an error</Trans>
					</h2>
				</div>
				<div className="flex flex-wrap items-center justify-center gap-2">
					<Button variant="outline" size="sm" asChild>
						<Link to="/">
							<Trans>Go home</Trans>
						</Link>
					</Button>
					<Button size="sm" onClick={() => window.location.reload()}>
						<Trans>Reload app</Trans>
					</Button>
				</div>
				<p className="max-h-40 w-full shrink-0 overflow-auto text-sm text-muted-foreground select-text cursor-text break-words">
					{message}
				</p>
			</div>
		</div>
	);
}
