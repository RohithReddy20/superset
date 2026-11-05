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
import type { EngineId, Room } from "../../types";
import { engineLabel } from "../OfficeFloor/constants";

interface HireDialogProps {
	open: boolean;
	rooms: Room[];
	pending: boolean;
	error: string | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (input: {
		id: string;
		name: string;
		role: string;
		room: string;
		engine: EngineId;
		model?: string;
	}) => void;
}

const ENGINES: Array<{ id: EngineId; model: string; hint: string }> = [
	{ id: "claude", model: "haiku", hint: "Claude Code" },
	{ id: "codex", model: "gpt-6.1-luna", hint: "Codex" },
	{ id: "agy", model: "gemini-3.8-flash", hint: "Antigravity" },
];

const toId = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 24);

export function HireDialog({
	open,
	rooms,
	pending,
	error,
	onOpenChange,
	onSubmit,
}: HireDialogProps) {
	const [name, setName] = useState("");
	const [role, setRole] = useState("");
	const [engine, setEngine] = useState<EngineId>("claude");
	const [model, setModel] = useState(ENGINES[0]?.model ?? "");
	const [room, setRoom] = useState(rooms[0]?.id ?? "");
	const id = toId(name);
	const roomId = rooms.some((r) => r.id === room) ? room : (rooms[0]?.id ?? "");
	const ready = id.length >= 2 && role.trim().length > 0 && roomId.length > 0;
	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="max-w-[440px]">
				<DialogHeader>
					<DialogTitle>Hire a teammate</DialogTitle>
					<DialogDescription>
						Starts a seat on one of your installed agent CLIs. It reads the
						office norms and answers when mentioned.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (ready)
							onSubmit({
								id,
								name: name.trim(),
								role: role.trim(),
								room: roomId,
								engine,
								model: model.trim() || undefined,
							});
					}}
				>
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="office-hire-name" className="text-xs">
								Name
							</Label>
							<Input
								id="office-hire-name"
								value={name}
								autoFocus
								placeholder="Nova"
								onChange={(event) => setName(event.target.value)}
							/>
							<span className="font-mono text-[10px] text-muted-foreground">
								@{id || "…"}
							</span>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Room</Label>
							<Select value={roomId} onValueChange={setRoom}>
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
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Runs on</Label>
							<Select
								value={engine}
								onValueChange={(value) => {
									const next = value as EngineId;
									setEngine(next);
									setModel(ENGINES.find((e) => e.id === next)?.model ?? "");
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ENGINES.map((e) => (
										<SelectItem key={e.id} value={e.id}>
											{engineLabel(e.id)} · {e.hint}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="office-hire-model" className="text-xs">
								Model
							</Label>
							<Input
								id="office-hire-model"
								value={model}
								onChange={(event) => setModel(event.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="office-hire-role" className="text-xs">
							Role
						</Label>
						<Textarea
							id="office-hire-role"
							value={role}
							rows={2}
							placeholder="Reviews pull requests and keeps the changelog."
							onChange={(event) => setRole(event.target.value)}
						/>
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
							Hire
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
