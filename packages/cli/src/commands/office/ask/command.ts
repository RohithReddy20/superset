import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { office, officeCaller } from "../../../lib/office";

export default command({
	description:
		"Ask a teammate for something; it goes on their list and their answer comes back to you",
	args: [
		positional("to").required().desc("@handle of the teammate, or @you"),
		positional("text").required().desc("What you need from them"),
	],
	skipMiddleware: true,
	run: async ({ args }) => {
		const { todo, waiting } = await office((o) =>
			o.teamAsk.mutate({
				caller: officeCaller(),
				to: args.to as string,
				text: args.text as string,
			}),
		);
		return {
			data: { id: todo.id, owner: todo.ownerName, waiting },
			message:
				waiting.length > 0
					? `${todo.id} is on ${todo.ownerName}'s list. ${todo.ownerName} cannot be reached now and will get it when back.`
					: `Asked ${todo.ownerName}; it is ${todo.id} on their list. Their answer will reach you here.`,
		};
	},
});
