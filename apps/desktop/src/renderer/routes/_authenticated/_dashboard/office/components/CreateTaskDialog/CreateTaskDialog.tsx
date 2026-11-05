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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import type { Room, Teammate } from "../../types";

interface CreateTaskDialogProps {
	open: boolean;
	rooms: Room[];
	teammates: Teammate[];
	defaultRoomId: string | null;
	hasProject: boolean;
	pending: boolean;
	error: string | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (input: {
		title: string;
		brief: string;
		roomId: string;
		ownerId: string | null;
		verifierId: string | null;
	}) => void;
}

const NOBODY = "__nobody__";

export function CreateTaskDialog({
	open,
	rooms,
	teammates,
	defaultRoomId,
	hasProject,
	pending,
	error,
	onOpenChange,
	onSubmit,
}: CreateTaskDialogProps) {
	const [title, setTitle] = useState("");
	const [brief, setBrief] = useState("");
	const [roomId, setRoomId] = useState(defaultRoomId ?? rooms[0]?.id ?? "");
	const [ownerId, setOwnerId] = useState(NOBODY);
	const [verifierId, setVerifierId] = useState(NOBODY);
	const ai = teammates.filter((t) => t.kind === "ai");
	const room = rooms.some((r) => r.id === roomId)
		? roomId
		: (rooms[0]?.id ?? "");
	const ready =
		title.trim().length > 0 && brief.trim().length > 0 && room.length > 0;
	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="max-w-[460px]">
				<DialogHeader>
					<DialogTitle>Open a task</DialogTitle>
					<DialogDescription>
						{hasProject
							? "The owner gets its own branch and checkout of the project, works there, and reports back in the task's thread. A verifier checks it before it reaches you."
							: "No project is set for this office yet, so the owner works without a checkout. Set project.repoPath in office.json to give tasks a branch each."}
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (ready)
							onSubmit({
								title: title.trim(),
								brief: brief.trim(),
								roomId: room,
								ownerId: ownerId === NOBODY ? null : ownerId,
								verifierId: verifierId === NOBODY ? null : verifierId,
							});
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="office-task-title" className="text-xs">
							Title
						</Label>
						<Input
							id="office-task-title"
							value={title}
							autoFocus
							placeholder="Add a changelog entry for 2.0.4"
							onChange={(event) => setTitle(event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="office-task-brief" className="text-xs">
							Brief, with what “done” looks like
						</Label>
						<Textarea
							id="office-task-brief"
							value={brief}
							rows={4}
							placeholder="Append a 2.0.4 section to CHANGELOG.md listing the three fixes from this week. Done when the file has the section and bun run lint passes."
							onChange={(event) => setBrief(event.target.value)}
						/>
					</div>
					<div className="grid grid-cols-3 gap-3">
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Room</Label>
							<Select value={room} onValueChange={setRoomId}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{rooms.map((r) => (
										<SelectItem key={r.id} value={r.id}>
											#{r.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Owner</Label>
							<Select value={ownerId} onValueChange={setOwnerId}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NOBODY}>later</SelectItem>
									{ai.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Verifier</Label>
							<Select value={verifierId} onValueChange={setVerifierId}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NOBODY}>the office picks</SelectItem>
									{ai.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
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
						<Button type="submit" disabled={pending || !ready}>
							Open task
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
