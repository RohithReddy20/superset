import type { CityProject } from "../../types";

/**
 * The city by where people sit: each room lists who sits in it, from any project. Someone in a
 * building's meeting room is listed with the building's oldest workspace, which has the first floor.
 */
export function seatedCity(projects: CityProject[]): CityProject[] {
	const everyone = projects.flatMap((p) =>
		p.workspaces.flatMap((w) => w.agents),
	);
	return projects.map((project) => {
		const first = [...project.workspaces].sort(
			(a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
		)[0];
		const rooms = new Set(project.workspaces.map((w) => w.id));
		return {
			...project,
			workspaces: project.workspaces.map((workspace) => ({
				...workspace,
				agents: everyone.filter(
					(a) =>
						a.place.projectId === project.id &&
						(a.place.roomId === workspace.id ||
							(workspace === first && !rooms.has(a.place.roomId))),
				),
			})),
		};
	});
}
