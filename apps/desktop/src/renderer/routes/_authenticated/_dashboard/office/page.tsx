import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { OfficeScreen } from "./components/OfficeScreen";

interface OfficeSearch {
	tab?: "tasks";
}

export const Route = createFileRoute("/_authenticated/_dashboard/office/")({
	component: OfficePage,
	validateSearch: (raw: Record<string, unknown>): OfficeSearch =>
		raw.tab === "tasks" ? { tab: "tasks" } : {},
});

function OfficePage() {
	// Dev builds bypass the flag — the local dev account isn't in the release condition.
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.OFFICE);
	const { tab } = Route.useSearch();
	if (env.NODE_ENV === "development") return <OfficeScreen tab={tab ?? null} />;
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return <OfficeScreen tab={tab ?? null} />;
}
