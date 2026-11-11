import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { LuKeyboard, LuListPlus, LuMessageSquare } from "react-icons/lu";
import { useAgentInput } from "../../../../../../../../hooks/useAgentInput";
import { useCityTeam } from "../../../../../../../../hooks/useCityTeam";
import type { CityAgent } from "../../../../../../../../types";
import { MessageBox } from "../../../../../MessageBox";
import { ModeSwitch } from "../../../../../ModeSwitch";
import { KeyButtons } from "../KeyButtons";

type Mode = "message" | "ask";

const MODES = [
	{
		id: "message",
		label: "Message",
		icon: LuMessageSquare,
		title: "Type into its terminal",
	},
	{
		id: "ask",
		label: "Ask for something",
		icon: LuListPlus,
		title: "Put an item on its own list; its answer comes back to you",
	},
] as const;

interface ComposerProps {
	agent: CityAgent;
	draft: string;
	onDraft: (text: string) => void;
}

/** The one box for talking to an agent: a message, something to put on its list, or a key for its screen. */
export function Composer({ agent, draft, onDraft }: ComposerProps) {
	const input = useAgentInput();
	const { ask } = useCityTeam();
	const [mode, setMode] = useState<Mode>("message");
	const [keys, setKeys] = useState(false);
	const [keyError, setKeyError] = useState<string | null>(null);
	const lost = agent.status === "lost";
	const wantsKey = agent.status === "permission";
	useEffect(() => {
		if (wantsKey) setKeys(true);
	}, [wantsKey]);

	const send = async (text: string) => {
		if (mode === "message") {
			await input.send(agent, text);
			return agent.status === "working"
				? `Sent. ${agent.name} reads it after this turn.`
				: "Sent";
		}
		const { todo, waiting } = await ask(`@${agent.handle}`, text);
		return waiting.length > 0
			? `${todo.id} is on its list. It gets it when it is back.`
			: `${todo.id} is on ${agent.name}'s list`;
	};

	return (
		<div className="flex flex-col gap-1.5">
			{keys && !lost ? (
				<KeyButtons
					onPress={(key) => {
						setKeyError(null);
						input
							.press(agent, key)
							.catch((cause: unknown) =>
								setKeyError(
									cause instanceof Error ? cause.message : String(cause),
								),
							);
					}}
				/>
			) : null}
			{keyError ? (
				<p role="alert" className="text-[11px] text-red-500">
					{keyError}
				</p>
			) : null}
			<MessageBox
				disabled={lost}
				draft={draft}
				onDraft={onDraft}
				sendLabel={mode === "ask" ? "Ask" : "Send"}
				placeholder={
					lost
						? `${agent.name} is disconnected. Reconnect it to write to it.`
						: mode === "ask"
							? `What do you need from ${agent.name}? It goes on its list.`
							: agent.status === "working"
								? `Message ${agent.name}; it reads it after this turn`
								: `Message ${agent.name}`
				}
				onSend={send}
				tools={
					<>
						{agent.handle ? (
							<ModeSwitch
								label="What to send"
								modes={MODES}
								value={mode}
								onChange={setMode}
							/>
						) : null}
						<button
							type="button"
							aria-pressed={keys}
							aria-label="Keys for its screen"
							title="Keys for a choice on its screen: ↑ ↓ Enter Esc"
							disabled={lost}
							onClick={() => setKeys((shown) => !shown)}
							className={cn(
								"flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
								keys
									? "bg-fill-selected text-foreground"
									: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
							)}
						>
							<LuKeyboard className="size-3.5" />
						</button>
					</>
				}
			/>
		</div>
	);
}
