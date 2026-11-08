import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { CityScreen } from "./components/CityScreen";

interface CitySearch {
	project?: string;
	/** An agent to open in its building, e.g. from the "Needs you" bar. */
	agent?: string;
	view?: "list";
}

const text = (value: unknown) =>
	typeof value === "string" && value ? value : undefined;

export const Route = createFileRoute("/_authenticated/_dashboard/office/city/")(
	{
		component: CityPage,
		validateSearch: (raw: Record<string, unknown>): CitySearch => {
			const search: CitySearch = {};
			const project = text(raw.project);
			const agent = text(raw.agent);
			if (project) search.project = project;
			if (agent) search.agent = agent;
			if (raw.view === "list") search.view = "list";
			return search;
		},
	},
);

function CityPage() {
	const { project, agent, view } = Route.useSearch();
	const screen = (
		<CityScreen
			projectId={project ?? null}
			agentId={agent ?? null}
			view={view ?? "map"}
		/>
	);
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.OFFICE);
	if (env.NODE_ENV === "development") return screen;
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return screen;
}
