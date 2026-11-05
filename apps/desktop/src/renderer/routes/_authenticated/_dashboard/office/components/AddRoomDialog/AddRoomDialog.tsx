import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useState } from "react";

interface AddRoomDialogProps {
	open: boolean;
	pending: boolean;
	error: string | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (input: { id: string; name: string }) => void;
}

const toId = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 24);

export function AddRoomDialog({
	open,
	pending,
	error,
	onOpenChange,
	onSubmit,
}: AddRoomDialogProps) {
	const [name, setName] = useState("");
	const id = toId(name);
	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="max-w-[400px]">
				<DialogHeader>
					<DialogTitle>Add a room</DialogTitle>
					<DialogDescription>
						A room is a place and a channel. Move teammates into it to give them
						a desk there.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (id.length >= 2) onSubmit({ id, name: name.trim() });
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="office-room-name" className="text-xs">
							Name
						</Label>
						<Input
							id="office-room-name"
							value={name}
							autoFocus
							placeholder="design"
							onChange={(event) => setName(event.target.value)}
						/>
						<span className="font-mono text-[10px] text-muted-foreground">
							#{id || "…"}
						</span>
					</div>
					{error ? <p className="text-xs text-destructive">{error}</p> : null}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={pending || id.length < 2}>
							Add room
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
