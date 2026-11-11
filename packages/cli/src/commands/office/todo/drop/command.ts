import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { office, officeCaller } from "../../../../lib/office";

export default command({
	description: "Take an item off your list without doing it",
	args: [positional("id").required().desc("The item, such as D-3")],
	skipMiddleware: true,
	run: async ({ args }) => {
		const todo = await office((o) =>
			o.teamTodoSet.mutate({
				caller: officeCaller(),
				id: args.id as string,
				state: "dropped",
			}),
		);
		return {
			data: { id: todo.id, state: todo.state },
			message: `${todo.id} is ${todo.state}.`,
		};
	},
});
