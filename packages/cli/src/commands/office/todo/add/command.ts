import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { office, officeCaller } from "../../../../lib/office";

export default command({
	description: "Add an item to your own list",
	args: [positional("text").required().desc("The item")],
	skipMiddleware: true,
	run: async ({ args }) => {
		const todo = await office((o) =>
			o.teamTodoAdd.mutate({
				caller: officeCaller(),
				text: args.text as string,
			}),
		);
		return {
			data: { id: todo.id, state: todo.state },
			message: `Added ${todo.id}.`,
		};
	},
});
