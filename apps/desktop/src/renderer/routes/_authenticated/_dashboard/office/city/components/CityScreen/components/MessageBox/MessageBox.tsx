import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { LuCheck, LuLoaderCircle, LuSend } from "react-icons/lu";

interface MessageBoxProps {
	placeholder: string;
	disabled?: boolean;
	/** Rejects with the reason when it could not be delivered; a string it resolves with is shown as the receipt. */
	onSend: (text: string) => Promise<string | undefined>;
	/** The text so far, when the owner keeps it; left out, the box keeps its own. */
	draft?: string;
	onDraft?: (text: string) => void;
	/** Shown at the left of the row under the text, e.g. a switch of what the box sends. */
	tools?: ReactNode;
	sendLabel?: string;
}

const MAX_HEIGHT = 168;
const RECEIPT_MS = 3500;

/** Enter sends, Shift+Enter starts a new line. Says so when the message went, and why when it did not. */
export function MessageBox({
	placeholder,
	disabled = false,
	onSend,
	draft,
	onDraft,
	tools,
	sendLabel = "Send",
}: MessageBoxProps) {
	const [own, setOwn] = useState("");
	const text = draft ?? own;
	const setText = onDraft ?? setOwn;
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [receipt, setReceipt] = useState<string | null>(null);
	const fieldRef = useRef<HTMLTextAreaElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the field grows with its text
	useLayoutEffect(() => {
		const field = fieldRef.current;
		if (!field) return;
		field.style.height = "auto";
		field.style.height = `${Math.min(MAX_HEIGHT, field.scrollHeight)}px`;
	}, [text]);

	useEffect(() => {
		if (!receipt) return;
		const timer = setTimeout(() => setReceipt(null), RECEIPT_MS);
		return () => clearTimeout(timer);
	}, [receipt]);

	const send = async () => {
		const message = text.trim();
		if (!message || sending || disabled) return;
		setSending(true);
		setError(null);
		setReceipt(null);
		try {
			const said = await onSend(message);
			setText("");
			setReceipt(said ?? "Sent");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<div
				className={cn(
					"flex flex-col rounded-lg border border-input bg-background transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
					disabled && "opacity-60",
				)}
			>
				<textarea
					ref={fieldRef}
					value={text}
					rows={2}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey) return;
						if (event.nativeEvent.isComposing) return;
						event.preventDefault();
						void send();
					}}
					className="min-h-[44px] w-full resize-none bg-transparent px-2.5 pt-2 text-[13px] leading-snug text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
				/>
				<div className="flex min-h-8 items-center gap-1.5 px-1.5 pb-1.5">
					<div className="flex shrink-0 items-center gap-1.5">{tools}</div>
					<output
						title={receipt ?? undefined}
						className="flex min-w-0 flex-1 items-center justify-end gap-1 text-[11px] text-muted-foreground"
					>
						{receipt ? (
							<>
								<LuCheck className="size-3 shrink-0 text-green-500 motion-safe:animate-in motion-safe:zoom-in-50" />
								<span className="truncate motion-safe:animate-in motion-safe:fade-in">
									{receipt}
								</span>
							</>
						) : null}
					</output>
					<Button
						size="icon-sm"
						aria-label={sendLabel}
						title={`${sendLabel} (Enter)`}
						disabled={!text.trim() || sending || disabled}
						onClick={() => void send()}
						className="size-7 shrink-0"
					>
						{sending ? (
							<LuLoaderCircle className="motion-safe:animate-spin" />
						) : (
							<LuSend />
						)}
					</Button>
				</div>
			</div>
			{error ? (
				<p role="alert" className="text-[11px] text-red-500">
					{error}
				</p>
			) : null}
		</div>
	);
}
