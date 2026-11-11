import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { handles, office, officeCaller } from "../../../lib/office";

export default command({
	description: "Write to one or more teammates; no answer is expected",
	args: [
		positional("to")
			.required()
			.desc("@handle, several joined by commas, or @all"),
		positional("text").required().desc("What to tell them"),
	],
	skipMiddleware: true,
	run: async ({ args }) => {
		const { note, waiting } = await office((o) =>
			o.teamSay.mutate({
				caller: officeCaller(),
				to: handles(args.to as string),
				text: args.text as string,
			}),
		);
		return {
			data: { id: note.id, to: note.toIds.length, waiting },
			message:
				waiting.length > 0
					? `Saved. ${waiting.join(", ")} cannot be reached now and will get it when back.`
					: `Sent to ${note.toIds.length}.`,
		};
	},
});
