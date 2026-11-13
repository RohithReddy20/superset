import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { env } from "renderer/env.renderer";
import { CityScreen } from "./components/CityScreen";

interface CitySearch {
	project?: string;
	/** The agent whose panel is open. */
	agent?: string;
	/** The room that is open: its conversation in the team view, its panel in a building. */
	room?: string;
	/** Unset is the team view. */
	view?: "map" | "list";
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
			const room = text(raw.room);
			if (agent) search.agent = agent;
			if (room) search.room = room;
			if (raw.view === "list" || raw.view === "map") search.view = raw.view;
			return search;
		},
	},
);

function CityPage() {
	const { project, agent, room, view } = Route.useSearch();
	const screen = (
		<CityScreen
			projectId={project ?? null}
			agentId={agent ?? null}
			roomId={room ?? null}
			view={view ?? "team"}
		/>
	);
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.OFFICE);
	if (env.NODE_ENV === "development") return screen;
	if (isEnabled === undefined) return null;
	if (!isEnabled) return <Redirect to="/v2-workspaces" />;
	return screen;
}
