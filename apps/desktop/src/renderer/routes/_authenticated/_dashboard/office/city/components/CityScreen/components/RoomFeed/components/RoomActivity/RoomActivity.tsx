import type { CityAgent } from "../../../../../../types";
import { AgentFace } from "../../../AgentFace";

interface RoomActivityProps {
	working: Pick<CityAgent, "terminalId" | "name">[];
	onSelectAgent: (terminalId: string) => void;
}

const DOT = "size-1 rounded-full bg-current motion-safe:animate-pulse";

/** Who in the room is at work right now, shown under the last thing said. */
export function RoomActivity({ working, onSelectAgent }: RoomActivityProps) {
	if (working.length === 0) return null;
	const names = working.map((agent) => agent.name);
	const last = names.pop();
	const who = names.length > 0 ? `${names.join(", ")} and ${last}` : last;

	return (
		<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
			<ul className="flex -space-x-1.5">
				{working.map((agent) => (
					<li key={agent.terminalId}>
						<button
							type="button"
							title={agent.name}
							aria-label={agent.name}
							onClick={() => onSelectAgent(agent.terminalId)}
							className="block rounded-full ring-2 ring-background focus-visible:outline-none focus-visible:ring-ring"
						>
							<AgentFace name={agent.name} className="size-5" />
						</button>
					</li>
				))}
			</ul>
			<span>
				{who} {working.length > 1 ? "are" : "is"} working
			</span>
			<span aria-hidden className="flex items-center gap-0.5">
				<span className={DOT} />
				<span className={`${DOT} [animation-delay:200ms]`} />
				<span className={`${DOT} [animation-delay:400ms]`} />
			</span>
		</div>
	);
}
