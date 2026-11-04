import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Office } from "../office/Office";
import type { OfficeEvent } from "../office/types";
import type { Seat } from "../seat/Seat";
import { handleMcpRequest } from "../tools/officeMcp";

const PAGE = join(import.meta.dir, "page.html");

export interface OfficeServerOptions {
	office: Office;
	port: number;
	seats: Map<string, Seat>;
	seatTokens: Map<string, string>;
}

export function startOfficeServer({
	office,
	port,
	seats,
	seatTokens,
}: OfficeServerOptions) {
	const seatByToken = new Map<string, Seat>();
	for (const [seatId, token] of seatTokens) {
		const seat = seats.get(seatId);
		if (seat) seatByToken.set(token, seat);
	}

	return Bun.serve({
		port,
		idleTimeout: 255,
		async fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === "/") {
				return new Response(readFileSync(PAGE, "utf8"), {
					headers: { "content-type": "text/html; charset=utf-8" },
				});
			}
			if (url.pathname === "/api/state")
				return Response.json(office.snapshot());
			if (url.pathname === "/events") return sse(office);
			if (url.pathname === "/api/say" && req.method === "POST") {
				const body = (await req.json()) as {
					authorId: string;
					roomId: string;
					threadId?: string | null;
					text: string;
				};
				try {
					const author = office.teammate(body.authorId);
					if (author?.kind !== "human")
						throw new Error("Only a person posts here");
					const { message } = office.post({
						authorId: body.authorId,
						roomId: body.roomId,
						threadId: body.threadId ?? null,
						text: body.text,
					});
					if (/^\s*stop\b/i.test(body.text) && message.threadId) {
						const canceled = office.cancelHandoffs(
							message.threadId,
							body.authorId,
						);
						for (const handoff of canceled)
							void seats.get(handoff.toId)?.cancel();
					}
					return Response.json({ ok: true, id: message.id });
				} catch (error) {
					return Response.json(
						{ error: (error as Error).message },
						{ status: 400 },
					);
				}
			}
			if (url.pathname === "/api/pause" && req.method === "POST") {
				const body = (await req.json()) as { id: string; paused: boolean };
				office.setPaused(body.id, body.paused);
				if (body.paused) void seats.get(body.id)?.cancel();
				return Response.json({ ok: true });
			}
			const mcp = /^\/mcp\/([\w-]+)$/.exec(url.pathname);
			if (mcp) {
				const seat = seatByToken.get(mcp[1] ?? "");
				if (!seat)
					return Response.json({ error: "Unknown seat" }, { status: 401 });
				return handleMcpRequest(office, seat, req);
			}
			return new Response("Not found", { status: 404 });
		},
	});
}

function sse(office: Office): Response {
	let unsubscribe = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			const send = (event: OfficeEvent) => {
				try {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
					);
				} catch {
					unsubscribe();
				}
			};
			unsubscribe = office.subscribe(send);
			const keepAlive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(": ping\n\n"));
				} catch {
					clearInterval(keepAlive);
				}
			}, 20_000);
		},
		cancel() {
			unsubscribe();
		},
	});
	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
		},
	});
}
