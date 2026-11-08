import { Button } from "@superset/ui/button";
import { useState } from "react";
import { LuSend } from "react-icons/lu";

interface MessageBoxProps {
	placeholder: string;
	disabled?: boolean;
	/** Rejects with the reason when the message could not be delivered. */
	onSend: (text: string) => Promise<void>;
}

/** Enter sends, Shift+Enter starts a new line. */
export function MessageBox({
	placeholder,
	disabled = false,
	onSend,
}: MessageBoxProps) {
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const send = async () => {
		const message = text.trim();
		if (!message || sending || disabled) return;
		setSending(true);
		setError(null);
		try {
			await onSend(message);
			setText("");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-end gap-1.5">
				<textarea
					value={text}
					rows={2}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey) return;
						event.preventDefault();
						void send();
					}}
					className="min-h-[52px] min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
				/>
				<Button
					size="icon-sm"
					aria-label="Send"
					disabled={!text.trim() || sending || disabled}
					onClick={() => void send()}
				>
					<LuSend />
				</Button>
			</div>
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
		</div>
	);
}
