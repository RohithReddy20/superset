import { command } from "../../../lib/command";
import { office, officeCaller } from "../../../lib/office";

export default command({
	description: "List the team and what each one carries",
	skipMiddleware: true,
	run: async () => {
		const caller = officeCaller();
		const { teammates } = await office((o) => o.team.query());
		const me = teammates.find((t) => t.id === caller)?.id ?? "you";
		const rows = teammates.map((t) => ({
			handle: `@${t.handle}`,
			name: t.name,
			kind: t.kind === "person" ? "person" : (t.label ?? "agent"),
			workspace: t.workspaceName ?? null,
			project: t.projectName ?? null,
			doing: t.doing,
			open: t.open,
			me: t.id === me,
		}));
		return {
			data: rows,
			message: rows
				.map(
					(r) =>
						`${r.handle}${r.me ? " (you)" : ""} · ${r.kind}${r.workspace ? ` · ${r.workspace}` : ""} · ${r.doing ?? "nothing marked"} · ${r.open} open`,
				)
				.join("\n"),
		};
	},
});
