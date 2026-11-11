import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { Office } from "../office/Office";
import { parseReplyTarget, replyTarget, type Task } from "../office/types";
import type { Seat } from "../seat/Seat";

async function result(run: () => Promise<unknown> | unknown) {
	try {
		const value = await run();
		return {
			content: [{ type: "text" as const, text: JSON.stringify(value ?? null) }],
		};
	} catch (error) {
		return {
			isError: true,
			content: [{ type: "text" as const, text: (error as Error).message }],
		};
	}
}

/** The office tools, acting as one seat. Every call runs under that seat's current turn. */
export function officeToolsServer(office: Office, seat: Seat): McpServer {
	const server = new McpServer({ name: "office", version: "0.0.1" });

	server.registerTool(
		"say",
		{
			description:
				"Post as yourself. reply_to is the target the inbox gave you (room:<id> or room:<id>/thread:<id>). Mention a teammate with @id to pull them in; mentioning an AI teammate hands them work.",
			inputSchema: { reply_to: z.string(), text: z.string().min(1).max(4000) },
		},
		(args) =>
			result(() => {
				const target = parseReplyTarget(args.reply_to);
				if (!target)
					throw new Error(
						"reply_to must be room:<id> or room:<id>/thread:<id>",
					);
				const turn = seat.currentTurn;
				const me = seat.teammate;
				const { message, held } = office.post({
					authorId: me.id,
					roomId: target.roomId,
					threadId: target.threadId,
					text: args.text,
					depth: turn?.depth ?? 0,
				});
				seat.noteSaid();
				office.log(
					seat.id,
					`say → ${args.reply_to}${held.length ? ` (held: ${held.map((h) => h.reason).join("; ")})` : ""}`,
				);
				return {
					messageId: message.id,
					reply_to: replyTarget(message.roomId, message.threadId ?? message.id),
					held: held.map((h) => ({ to: h.toId, reason: h.reason })),
				};
			}),
	);

	server.registerTool(
		"set_status",
		{
			description:
				"One short line about what you are doing right now, shown next to your name in the office.",
			inputSchema: { text: z.string().min(1).max(120) },
		},
		(args) =>
			result(() => {
				office.setLine(seat.id, args.text);
				seat.noteStatus();
				office.log(seat.id, `set_status: ${args.text}`);
				return { ok: true };
			}),
	);

	server.registerTool(
		"who_is_here",
		{
			description:
				"Everyone in the office, with presence and what they are doing.",
			inputSchema: {},
		},
		() =>
			result(() =>
				office.teammates().map((t) => ({
					id: t.id,
					name: t.name,
					kind: t.kind,
					engine: t.engine,
					role: t.role,
					presence: t.presence,
					doing: t.line,
					paused: t.paused,
				})),
			),
	);

	server.registerTool(
		"read_thread",
		{
			description: "The messages in a room or thread, oldest first.",
			inputSchema: { reply_to: z.string() },
		},
		(args) =>
			result(() => {
				const target = parseReplyTarget(args.reply_to);
				if (!target)
					throw new Error(
						"reply_to must be room:<id> or room:<id>/thread:<id>",
					);
				const messages = target.threadId
					? office.thread(target.roomId, target.threadId)
					: office.recent(target.roomId);
				return messages.map((m) => ({
					id: m.id,
					from: office.teammate(m.authorId)?.name ?? m.authorId,
					kind: m.kind,
					text: m.text,
					at: new Date(m.ts).toISOString(),
				}));
			}),
	);

	const taskView = (t: Task) => ({
		id: t.id,
		title: t.title,
		brief: t.brief,
		status: t.status,
		owner: t.ownerId,
		verifier: t.verifierId,
		reply_to: replyTarget(t.roomId, t.threadId),
		branch: t.branch,
		workspace: t.workspacePath,
		check: t.check ? { ok: t.check.ok, command: t.check.command } : undefined,
		last_note: t.notes.at(-1)?.text,
	});

	server.registerTool(
		"read_board",
		{
			description:
				"Every task in the office with its owner and status. Statuses: todo, doing, review (owner finished, checks and a verifier pending), verified (ready for a person), done, blocked.",
			inputSchema: {},
		},
		() => result(() => office.tasks().map(taskView)),
	);

	server.registerTool(
		"read_task",
		{
			description: "One task in full, with its notes so far.",
			inputSchema: { task_id: z.string() },
		},
		(args) =>
			result(() => {
				const task = office.task(args.task_id);
				if (!task) throw new Error(`No task ${args.task_id}`);
				return {
					...taskView(task),
					notes: task.notes.map((n) => ({
						by: office.teammate(n.by)?.name ?? n.by,
						status: n.status,
						text: n.text,
					})),
					check_output: task.check?.output,
				};
			}),
	);

	server.registerTool(
		"create_task",
		{
			description:
				"Open a task for a piece of work. It gets its own thread in the room of reply_to. Give it an owner only if you are allowed to assign (a person, the lead, or the creator of an unowned task).",
			inputSchema: {
				reply_to: z.string(),
				title: z.string().min(1).max(120),
				brief: z.string().min(1).max(4000),
				owner: z.string().optional(),
			},
		},
		(args) =>
			result(() => {
				const target = parseReplyTarget(args.reply_to);
				if (!target)
					throw new Error(
						"reply_to must be room:<id> or room:<id>/thread:<id>",
					);
				const owner = args.owner ? office.teammateByName(args.owner) : null;
				if (args.owner && !owner) throw new Error(`No teammate ${args.owner}`);
				const task = office.createTask({
					title: args.title,
					brief: args.brief,
					by: seat.id,
					roomId: target.roomId,
					threadId: target.threadId,
					ownerId: owner?.id ?? null,
				});
				office.log(seat.id, `create_task ${task.id}: ${task.title}`);
				return taskView(task);
			}),
	);

	server.registerTool(
		"assign_task",
		{
			description:
				"Give a task an owner. Only a person, the lead, or the creator of a still-unowned task may do this.",
			inputSchema: { task_id: z.string(), owner: z.string() },
		},
		(args) =>
			result(() => {
				const owner = office.teammateByName(args.owner);
				if (!owner) throw new Error(`No teammate ${args.owner}`);
				const task = office.assignTask(args.task_id, owner.id, seat.id);
				office.log(seat.id, `assign_task ${task.id} → ${owner.id}`);
				return taskView(task);
			}),
	);

	server.registerTool(
		"update_task",
		{
			description:
				"Report on a task you own or verify. Owner: doing (started), review (finished, say what changed and how you tested it), blocked (say what you need). Verifier: verified (it meets the brief), or doing with what must change. Only a person or the lead can mark done.",
			inputSchema: {
				task_id: z.string(),
				status: z.enum([
					"todo",
					"doing",
					"review",
					"verified",
					"done",
					"blocked",
				]),
				note: z.string().min(1).max(4000),
			},
		},
		(args) =>
			result(() => {
				const task = office.updateTask(
					args.task_id,
					{ status: args.status, note: args.note },
					seat.id,
				);
				seat.noteSaid();
				office.log(seat.id, `update_task ${task.id} → ${task.status}`);
				return taskView(task);
			}),
	);

	return server;
}

export async function handleMcpRequest(
	office: Office,
	seat: Seat,
	req: Request,
): Promise<Response> {
	const server = officeToolsServer(office, seat);
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);
	return transport.handleRequest(req);
}
