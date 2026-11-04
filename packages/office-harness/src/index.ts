import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Office } from "./office/Office";
import type { EngineId } from "./office/types";
import { ENGINES } from "./seat/engines";
import { Seat } from "./seat/Seat";
import { startOfficeServer } from "./web/server";

interface OfficeConfig {
	port?: number;
	home?: string;
	limits?: Partial<Office["limits"]>;
	rooms: Array<{
		id: string;
		name: string;
		kind?: "room" | "dm";
		members: string[];
	}>;
	humans: Array<{ id: string; name: string; role: string; room: string }>;
	seats: Array<{
		id: string;
		name: string;
		role: string;
		room: string;
		engine: EngineId;
		model?: string;
		instructions?: string;
		dailyTurns?: number;
		extraArgs?: string[];
	}>;
}

const configPath = resolve(process.argv[2] ?? "office.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as OfficeConfig;
const home = resolve(config.home ?? join(homedir(), ".paradev-office"));
const port = config.port ?? 4747;
const onlySeats = process.argv.includes("--no-seats")
	? new Set<string>()
	: null;

const office = new Office({
	statePath: join(home, "state.json"),
	limits: config.limits,
});

for (const human of config.humans) {
	office.upsertTeammate({
		id: human.id,
		name: human.name,
		kind: "human",
		role: human.role,
		roomId: human.room,
	});
}
for (const seat of config.seats) {
	office.upsertTeammate({
		id: seat.id,
		name: seat.name,
		kind: "ai",
		role: seat.role,
		roomId: seat.room,
		engine: seat.engine,
		model: seat.model,
		instructions: seat.instructions,
		dailyTurns: seat.dailyTurns,
	});
}
for (const room of config.rooms) {
	office.upsertRoom({
		id: room.id,
		name: room.name,
		kind: room.kind ?? "room",
		members: room.members,
	});
}
for (const human of config.humans)
	office.setPresence(human.id, "in-office", "here");

const seats = new Map<string, Seat>();
const seatTokens = new Map<string, string>();
for (const spec of config.seats) {
	const token = randomBytes(12).toString("hex");
	seatTokens.set(spec.id, token);
	const teammate = office.teammate(spec.id);
	if (!teammate) continue;
	const engine = ENGINES[spec.engine];
	seats.set(
		spec.id,
		new Seat({
			teammate,
			office,
			homeDir: join(home, "seats", spec.id),
			mcpUrl: `http://127.0.0.1:${port}/mcp/${token}`,
			engineLabel: engine.label,
			fullAccessModeId: engine.fullAccessModeId,
			launch: async () =>
				engine.launch({ model: spec.model, extraArgs: spec.extraArgs }),
		}),
	);
}

const server = startOfficeServer({ office, port, seats, seatTokens });
console.log(`office at http://localhost:${server.port}  (state in ${home})`);

office.subscribe((event) => {
	if (event.type === "log") console.log(`[${event.seatId}] ${event.text}`);
	if (event.type === "message") {
		const author =
			office.teammate(event.message.authorId)?.name ?? event.message.authorId;
		const thread = event.message.threadId ? `/${event.message.threadId}` : "";
		console.log(
			`#${event.message.roomId}${thread} ${author}: ${event.message.text}`,
		);
	}
});

for (const [id, seat] of seats) {
	if (onlySeats && !onlySeats.has(id)) continue;
	seat.start().catch((error: Error) => {
		console.error(`[${id}] failed to start: ${error.message}`);
		office.setPresence(
			id,
			"away",
			`failed to start: ${error.message.slice(0, 80)}`,
		);
	});
}

const shutdown = async () => {
	console.log("closing seats…");
	await Promise.all(
		[...seats.values()].map((seat) => seat.stop().catch(() => {})),
	);
	server.stop(true);
	process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
