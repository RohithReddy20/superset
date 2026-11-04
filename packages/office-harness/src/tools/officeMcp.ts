import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { Office } from "../office/Office";
import { parseReplyTarget, replyTarget } from "../office/types";
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
				const aiMentions = [...args.text.matchAll(/@([\w-]+)/g)]
					.map((m) => office.teammateByName(m[1] ?? ""))
					.filter((t) => t && t.kind === "ai" && t.id !== me.id);
				if (turn && aiMentions.length > 0) {
					if (turn.asks + aiMentions.length > office.limits.maxAsksPerTurn)
						throw new Error(
							`You may pull in at most ${office.limits.maxAsksPerTurn} teammates in one turn. Answer the person instead.`,
						);
					turn.asks += aiMentions.length;
				}
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
