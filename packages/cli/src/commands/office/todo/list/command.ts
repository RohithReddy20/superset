import { boolean, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { office, officeCaller } from "../../../../lib/office";

export default command({
	description: "Show a list: your own, or a teammate's",
	options: {
		of: string().desc("@handle whose list to show (default: your own)"),
		all: boolean().desc("Include finished and dropped items"),
	},
	skipMiddleware: true,
	run: async ({ options }) => {
		const caller = officeCaller();
		const { teammates, todos } = await office((o) => o.team.query());
		const wanted = options.of?.replace(/^@/, "").toLowerCase();
		const owner = wanted
			? teammates.find((t) => t.handle === wanted)
			: (teammates.find((t) => t.id === caller) ??
				teammates.find((t) => t.kind === "person"));
		const rows = todos
			.filter((t) => t.ownerId === owner?.id)
			.filter((t) => options.all || t.state === "open" || t.state === "doing")
			.map((t) => ({
				id: t.id,
				state: t.state,
				text: t.text,
				askedBy: t.askedByName ?? null,
			}));
		return {
			data: { owner: owner ? `@${owner.handle}` : null, items: rows },
			message:
				rows
					.map(
						(r) =>
							`${r.id} · ${r.state} · ${r.text}${r.askedBy ? ` (asked by ${r.askedBy})` : ""}`,
					)
					.join("\n") || "Nothing on the list.",
		};
	},
});
