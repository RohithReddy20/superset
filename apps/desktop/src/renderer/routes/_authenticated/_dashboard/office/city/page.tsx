import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { CityScreen } from "./components/CityScreen";

interface CitySearch {
	project?: string;
}

export const Route = createFileRoute("/_authenticated/_dashboard/office/city/")(
	{
		component: CityPage,
		validateSearch: (raw: Record<string, unknown>): CitySearch =>
			typeof raw.project === "string" && raw.project
				? { project: raw.project }
				: {},
	},
);

function CityPage() {
	const { project } = Route.useSearch();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.OFFICE);
	if (env.NODE_ENV === "development")
		return <CityScreen projectId={project ?? null} />;
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return <CityScreen projectId={project ?? null} />;
}
