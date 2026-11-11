import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { office, officeCaller } from "../../../lib/office";

function give(value: string): { to: string; text: string } {
	const at = value.indexOf(":");
	const to = value.slice(0, at).trim();
	const text = value.slice(at + 1).trim();
	if (at < 1 || !to || !text)
		throw new CLIError(`--give needs "@name: what they took", got "${value}"`);
	return { to, text };
}

export default command({
	description:
		"Write down what the team decided, and put on each one's list what they took",
	args: [positional("text").required().desc("What was decided")],
	options: {
		give: string()
			.variadic()
			.desc('"@name: what they took"; repeat it, and use @me for yourself'),
	},
	skipMiddleware: true,
	run: async ({ args, options }) => {
		const { note, todos, waiting } = await office((o) =>
			o.teamDecide.mutate({
				caller: officeCaller(),
				text: args.text as string,
				gives: (options.give ?? []).map(give),
			}),
		);
		return {
			data: { id: note.id, items: todos.map((t) => t.id), waiting },
			message: [
				`Written down for ${note.toIds.length}.`,
				todos.length > 0
					? `On lists: ${todos.map((t) => `${t.id} (${t.ownerName})`).join(", ")}.`
					: "",
				waiting.length > 0
					? `${waiting.join(", ")} cannot be reached now and will get it when back.`
					: "",
			]
				.filter(Boolean)
				.join(" "),
		};
	},
});
