import { positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { office, officeCaller } from "../../../lib/office";

export default command({
	description:
		"Hand your work to a new agent in another workspace, with the brief you wrote",
	args: [
		positional("workspace").required().desc("The workspace's name or id"),
		positional("brief")
			.required()
			.desc("What was asked, what is done, what is left, and what matters"),
	],
	options: {
		agent: string().desc("The agent to start there (default: your own kind)"),
	},
	skipMiddleware: true,
	run: async ({ args, options }) => {
		const result = await office((o) =>
			o.teamHandover.mutate({
				caller: officeCaller(),
				to: args.workspace as string,
				agent: options.agent ?? undefined,
				brief: args.brief as string,
			}),
		);
		return {
			data: result,
			message: `A new agent took over in ${result.workspace}. Stop working on that; answer its questions if it asks.`,
		};
	},
});
