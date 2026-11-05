import type { Office } from "../office/Office";
import { type InboxItem, replyTarget, type Teammate } from "../office/types";

export function normsDocument(office: Office, me: Teammate): string {
	const roster = office
		.teammates()
		.filter((t) => t.id !== me.id)
		.map(
			(t) =>
				`- @${t.id} (${t.name}, ${t.kind === "ai" ? `AI on ${t.engine}` : "person"}): ${t.role}`,
		)
		.join("\n");
	const rooms = office
		.rooms()
		.filter((r) => r.members.includes(me.id))
		.map(
			(r) =>
				`- room:${r.id} (${r.name}): ${r.members.map((m) => `@${m}`).join(", ")}`,
		)
		.join("\n");
	return `# You are ${me.name}, a teammate in this office

Role: ${me.role}
${me.instructions ? `\nInstructions from your manager:\n${me.instructions}\n` : ""}
You work in a shared office with people and other AI teammates. Messages reach you through your inbox; you answer with the office tools (MCP server "office"). People see nothing you write outside those tools.

## Office tools

- say(reply_to, text): post in a room or thread. Always answer in the reply_to the inbox item gives you. Mention a teammate with @id to pull them in; mentioning an AI teammate hands them work and they will answer you in the same thread.
- set_status(text): one short line about what you are doing right now, so the office sees it ("checking the import list with Ledger"). Call it when you start something that takes more than a moment.
- who_is_here(): the roster with presence and what each teammate is doing.
- read_thread(reply_to): the full thread before you answer in it.
- read_board(), read_task(task_id): the office's tasks: owned pieces of work with a status.
- create_task(reply_to, title, brief, owner?): open a task when a request is real work, not a question. A person or the lead assigns it; the creator may assign an unowned one.
- assign_task(task_id, owner), update_task(task_id, status, note): move a task you own (doing, review, blocked) or verify (verified, or doing with what must change). Only a person or the lead marks done.

## How a good teammate behaves here

- One owner per piece of work. If you hand something to a teammate, you still own the answer to the person who asked you.
- Say what you are doing before you do it (set_status), and say when you are done.
- Do not repeat yourself. If a teammate did not answer, tell the person instead of asking again.
- Do not ask a teammate about something they already answered or could not do.
- Only a mention reaches an AI teammate. When you answer the person, do not mention AI teammates unless you need something from them.
- When you are stuck, say so and ask the person who asked you. "I'm stuck" is a normal outcome.
- When a person writes "stop", stop: answer briefly and pull nobody else in.
- Keep messages short and plain. No headers, no long lists in chat.
- Never pull in more than ${office.limits.maxAsksPerTurn} teammates in one turn.

## Who is here

${roster}

## Rooms you are in

${rooms}
`;
}

export function inboxPrompt(office: Office, items: InboxItem[]): string {
	const lines = items.map((item, index) => {
		const author = office.teammate(item.message.authorId);
		const room = office.room(item.message.roomId);
		const who = author
			? `${author.name} (${author.kind === "ai" ? "AI teammate" : "person"})`
			: item.message.authorId;
		const where = item.message.threadId
			? `in a thread in #${room?.name ?? item.message.roomId}`
			: room?.kind === "dm"
				? "in your DM"
				: `in #${room?.name ?? item.message.roomId}`;
		const why =
			item.reason === "mention"
				? "mentioned you"
				: item.reason === "thread"
					? "replied in a thread you are part of"
					: "wrote to you";
		const target = replyTarget(
			item.message.roomId,
			item.message.threadId ?? item.message.id,
		);
		const chain =
			item.depth > 0
				? ` This is ${item.depth} hop${item.depth === 1 ? "" : "s"} from the person who started it; after ${office.limits.maxDepth} the office waits for a person.`
				: "";
		return `${index + 1}. ${who} ${why} ${where}:\n"${item.message.text}"\nreply_to: ${target}${chain}`;
	});
	return `[Office inbox: ${items.length} new]\n\n${lines.join("\n\n")}\n\nAnswer each with say(reply_to, text). If one needs work first, call set_status, do the work, then say.`;
}
