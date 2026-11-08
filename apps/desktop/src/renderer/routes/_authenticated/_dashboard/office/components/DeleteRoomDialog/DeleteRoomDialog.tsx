import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

interface DeleteRoomDialogProps {
	open: boolean;
	roomName: string;
	messageCount: number;
	/** Names of the teammates whose home room this is. */
	sitting: string[];
	/** Where someone goes when they are in no other room. */
	fallbackRoomName: string | null;
	pending: boolean;
	error: string | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function DeleteRoomDialog({
	open,
	roomName,
	messageCount,
	sitting,
	fallbackRoomName,
	pending,
	error,
	onOpenChange,
	onConfirm,
}: DeleteRoomDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[400px]">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete #{roomName}?</AlertDialogTitle>
					<AlertDialogDescription>
						This deletes the room and its {messageCount}{" "}
						{messageCount === 1 ? "message" : "messages"}. Its desks become free
						for a new room.
					</AlertDialogDescription>
					{sitting.length > 0 ? (
						<AlertDialogDescription>
							Teammates who sit here move to another room they are in
							{fallbackRoomName ? `, or to #${fallbackRoomName}` : ""}:{" "}
							{sitting.join(", ")}.
						</AlertDialogDescription>
					) : null}
				</AlertDialogHeader>
				{error ? <p className="text-xs text-destructive">{error}</p> : null}
				<AlertDialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={pending}
						onClick={onConfirm}
					>
						Delete room
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
