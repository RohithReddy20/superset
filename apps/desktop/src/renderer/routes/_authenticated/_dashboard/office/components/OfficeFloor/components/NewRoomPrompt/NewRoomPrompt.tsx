import { Button } from "@superset/ui/button";
import { useEffect, useRef, useState } from "react";

interface NewRoomPromptProps {
	count: number;
	onCreate: (name: string) => Promise<void>;
	onCancel: () => void;
}

/** Names the room for teammates just put down on empty desks. */
export function NewRoomPrompt({
	count,
	onCreate,
	onCancel,
}: NewRoomPromptProps) {
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus({ preventScroll: true });
	}, []);

	const create = async () => {
		if (!name.trim() || busy) return;
		setBusy(true);
		setError(null);
		try {
			await onCreate(name.trim());
		} catch (failure) {
			setError((failure as Error).message);
			setBusy(false);
		}
	};

	return (
		<form
			className="absolute top-3 left-1/2 flex w-[min(420px,calc(100%-24px))] -translate-x-1/2 flex-col gap-2 rounded-xl border border-border bg-popover/95 p-3 shadow-lg backdrop-blur"
			onSubmit={(event) => {
				event.preventDefault();
				void create();
			}}
		>
			<div className="text-[13px] font-medium text-foreground">
				New room at these desks
			</div>
			<div className="text-[12px] text-muted-foreground">
				{count === 1
					? "Your teammate moves in once it has a name."
					: `All ${count} move in once it has a name.`}
			</div>
			<div className="flex items-center gap-1.5">
				<input
					ref={inputRef}
					value={name}
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") onCancel();
					}}
					maxLength={40}
					placeholder="Room name, like research"
					aria-label="New room name"
					className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
				/>
				<Button type="submit" size="sm" disabled={!name.trim() || busy}>
					Create
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
			{error ? (
				<div className="text-[12px] text-destructive">{error}</div>
			) : null}
		</form>
	);
}
