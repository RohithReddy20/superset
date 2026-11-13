import { useEffect, useState } from "react";
import { LuGavel, LuMessageSquare } from "react-icons/lu";
import { useCityTeam } from "../../../../hooks/useCityTeam";
import type { CityAgent, CityPlace, CityRoom } from "../../../../types";
import { MessageBox } from "../MessageBox";
import { ModeSwitch } from "../ModeSwitch";
import { DecideBox } from "./components/DecideBox";

type Mode = "message" | "decision";

const MODES = [
	{
		id: "message",
		label: "Message",
		icon: LuMessageSquare,
		title: "Write to everyone sitting here",
	},
	{
		id: "decision",
		label: "Decision",
		icon: LuGavel,
		title: "Write down what was decided, and who took what",
	},
] as const;

const RECEIPT_MS = 5000;

interface RoomComposerProps {
	place: CityPlace;
	/** Who sits here with their @handles; absent when the room is empty. */
	room: CityRoom | undefined;
	people: CityAgent[];
	draft: string;
	onDraft: (text: string) => void;
}

/** One box to write to everyone sitting in a room, or to write down what the room decided. */
export function RoomComposer({
	place,
	room,
	people,
	draft,
	onDraft,
}: RoomComposerProps) {
	const { sayToRoom } = useCityTeam();
	const [mode, setMode] = useState<Mode>("message");
	const [receipt, setReceipt] = useState<string | null>(null);
	const empty = people.length === 0;
	const handleOf = new Map(
		(room?.members ?? []).map((m) => [m.terminalId, m.handle]),
	);

	useEffect(() => {
		if (!receipt) return;
		const timer = setTimeout(() => setReceipt(null), RECEIPT_MS);
		return () => clearTimeout(timer);
	}, [receipt]);

	const switcher = (
		<ModeSwitch
			label="What to write"
			modes={MODES}
			value={mode}
			onChange={setMode}
		/>
	);

	return (
		<div className="flex flex-col gap-1.5">
			{receipt ? (
				<output className="text-[11px] text-muted-foreground motion-safe:animate-in motion-safe:fade-in">
					{receipt}
				</output>
			) : null}
			{mode === "decision" && !empty ? (
				<>
					{switcher}
					<DecideBox
						place={place}
						people={people}
						handleOf={handleOf}
						onDone={(text) => {
							setReceipt(text);
							setMode("message");
						}}
					/>
				</>
			) : (
				<MessageBox
					disabled={empty}
					draft={draft}
					onDraft={onDraft}
					placeholder={
						empty
							? "Nobody sits here yet, so there is nobody to write to."
							: `Message everyone here (${people.length})`
					}
					onSend={async (text) => {
						const { waiting } = await sayToRoom(place, text);
						return waiting.length > 0
							? `Sent. ${waiting.join(", ")} get it when back.`
							: `Sent to ${people.length}`;
					}}
					tools={empty ? null : switcher}
				/>
			)}
		</div>
	);
}
