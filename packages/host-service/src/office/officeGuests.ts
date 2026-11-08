import type { InboxItem, Office } from "@superset/office-harness";

/** A CLI agent invited into an office room; its workspace, folder and branch stay its own. */
export interface OfficeGuestInfo {
	terminalId: string;
	workspaceId: string;
	agentId: string;
	label: string;
	workspaceName: string;
	projectName: string;
	roomId: string;
}

interface Guest {
	id: string;
	info: OfficeGuestInfo;
	/** Messages typed into its terminal that still wait for its answer, oldest first. */
	waiting: InboxItem[];
	/** Who was in its room when it was last told; a change is told with the next message. */
	told: string | null;
}

export const GUEST_NO_REPLY = "no reply";
/** Guest teammate ids start with this, so leftovers from an earlier run can be told apart. */
const GUEST_PREFIX = "cli-";
const CONTEXT_MESSAGES = 4;
const CONTEXT_CHARS = 400;

/**
 * CLI agents sitting in office rooms. A guest is an office teammate whose inbox types into its
 * terminal: it hears what @mentions it or continues a thread it is in, and its answer, when its turn
 * ends, is posted back into that thread as its own message, under the office's usual limits.
 */
export class OfficeGuests {
	private readonly guests = new Map<string, Guest>();

	constructor(
		private readonly deps: {
			office: Office;
			send: (info: OfficeGuestInfo, text: string) => Promise<void>;
			/** Room membership changed; the runtime puts guests into its rooms again. */
			onRoomsChanged: () => void;
		},
	) {}

	idOf(terminalId: string): string {
		return `${GUEST_PREFIX}${terminalId.slice(0, 8)}`;
	}

	/** Guest teammate ids sitting in a room. */
	membersOf(roomId: string): string[] {
		return [...this.guests.values()]
			.filter((g) => g.info.roomId === roomId)
			.map((g) => g.id);
	}

	rooms(): Array<{ id: string; name: string }> {
		return this.deps.office
			.rooms()
			.filter((r) => r.kind === "room")
			.map((r) => ({ id: r.id, name: r.name }));
	}

	/** Makes the guests exactly these agents: newcomers join, moved ones move, the rest leave. */
	sync(list: OfficeGuestInfo[]): void {
		const wanted = new Map(list.map((info) => [info.terminalId, info]));
		let changed = false;
		for (const [terminalId, guest] of this.guests) {
			if (wanted.has(terminalId)) continue;
			this.guests.delete(terminalId);
			this.deps.office.removeTeammate(guest.id);
			changed = true;
		}
		const keep = new Set(list.map((info) => this.idOf(info.terminalId)));
		for (const teammate of [...this.deps.office.teammates()])
			if (teammate.id.startsWith(GUEST_PREFIX) && !keep.has(teammate.id)) {
				this.deps.office.removeTeammate(teammate.id);
				changed = true;
			}
		for (const info of list) {
			if (!this.deps.office.room(info.roomId)) continue;
			const guest = this.guests.get(info.terminalId);
			if (guest && guest.info.roomId === info.roomId) continue;
			changed = true;
			const id = this.idOf(info.terminalId);
			this.deps.office.upsertTeammate({
				id,
				name: this.deps.office.teammate(id)?.name ?? this.nameFor(info, id),
				kind: "ai",
				role: `${info.label} CLI, working in "${info.workspaceName}" (${info.projectName})`,
				roomId: info.roomId,
				...(info.agentId === "claude" || info.agentId === "codex"
					? { engine: info.agentId }
					: {}),
			});
			this.deps.office.setPresence(id, "in-office", "");
			this.guests.set(info.terminalId, {
				id,
				info,
				waiting: guest?.waiting ?? [],
				told: null,
			});
			this.deps.office.onInbox(id, (item) => {
				void this.receive(info.terminalId, item);
			});
		}
		if (changed) this.deps.onRoomsChanged();
	}

	/** A guest's turn ended: its answer goes to the thread of the oldest message it was given. */
	async turnEnded(terminalId: string, reply: string): Promise<void> {
		const guest = this.guests.get(terminalId);
		const item = guest?.waiting.shift();
		if (!guest || !item) return;
		const text = reply.trim();
		if (!text || saysNoReply(text)) return;
		const message = item.message;
		this.deps.office.post({
			authorId: guest.id,
			roomId: message.roomId,
			threadId: message.threadId ?? message.id,
			text,
			depth: item.depth,
		});
	}

	private async receive(terminalId: string, item: InboxItem): Promise<void> {
		const guest = this.guests.get(terminalId);
		if (!guest) return;
		const office = this.deps.office;
		if (!office.spendTurn(guest.id)) return;
		guest.waiting.push(item);
		const message = item.message;
		const room = office.room(message.roomId);
		const author = office.teammate(message.authorId);
		const people = (room?.members ?? [])
			.filter((id) => id !== guest.id)
			.map((id) => office.teammate(id))
			.filter((t) => t !== undefined)
			.map((t) =>
				t.kind === "human"
					? `@${t.name} (a person)`
					: `@${t.name} (${t.role.slice(0, 80)})`,
			)
			.join(", ");
		const parts: string[] = [];
		if (guest.told === null)
			parts.push(
				`[Paradev office] You are @${office.teammate(guest.id)?.name ?? guest.id} in the office room #${room?.name ?? message.roomId}, with ${people || "nobody else"}. Your own workspace, folder and branch are unchanged; keep working there.`,
			);
		else if (guest.told !== people)
			parts.push(`[Paradev office] Now in #${room?.name}: ${people}.`);
		guest.told = people;

		const threadId = message.threadId ?? message.id;
		const earlier = office
			.thread(message.roomId, threadId)
			.filter((m) => m.id !== message.id && m.kind === "chat")
			.slice(-CONTEXT_MESSAGES)
			.map(
				(m) =>
					`${office.teammate(m.authorId)?.name ?? "someone"}: ${clip(m.text)}`,
			);
		if (earlier.length > 0)
			parts.push(`Earlier in this thread:\n${earlier.join("\n")}`);
		parts.push(
			`[#${room?.name ?? message.roomId}] ${author?.name ?? "Someone"}${item.reason === "mention" ? " mentioned you" : ""}:\n${message.text}`,
		);
		parts.push(
			`Your answer is posted in this thread. Mention @Name to bring someone in. If you have nothing to add, write only "${GUEST_NO_REPLY}".`,
		);
		office.setPresence(guest.id, "focused", clip(message.text, 60));
		await this.deps
			.send(guest.info, parts.join("\n\n"))
			.catch((error: unknown) => {
				guest.waiting = guest.waiting.filter((w) => w !== item);
				office.log(
					guest.id,
					`could not reach its terminal: ${error instanceof Error ? error.message : String(error)}`,
				);
			});
	}

	/** An office name that @mentions cleanly: the agent kind and its workspace, unique in the office. */
	private nameFor(info: OfficeGuestInfo, id: string): string {
		const base = `${slug(info.agentId) || "agent"}-${slug(info.workspaceName).slice(0, 16) || "cli"}`;
		let name = base;
		for (let n = 2; ; n++) {
			const taken = this.deps.office.teammateByName(name);
			if (!taken || taken.id === id) return name;
			name = `${base}-${n}`;
		}
	}
}

function saysNoReply(reply: string): boolean {
	return reply.split("\n").some((line) =>
		/^\(?no reply\)?[.!]?$/.test(
			line
				.trim()
				.replace(/[*_`"]/g, "")
				.toLowerCase(),
		),
	);
}

function slug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function clip(text: string, max = CONTEXT_CHARS): string {
	const one = text.replace(/\s+/g, " ").trim();
	return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
