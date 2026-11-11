import type {
	CityAgent,
	CityHandover,
	CityProject,
} from "../../../../../../../../types";
import { HandoverBox } from "../HandoverBox";
import { RemoveAgent } from "../RemoveAgent";
import { SeatRow } from "../SeatRow";
import { ManagePart } from "./components/ManagePart";

interface ManageTabProps {
	agent: CityAgent;
	projects: CityProject[];
	handovers: CityHandover[];
	onSelectAgent: (terminalId: string) => void;
	onRemoved: () => void;
}

/** The things done to an agent now and then: where it sits, handing its work over, removing it. */
export function ManageTab({
	agent,
	projects,
	handovers,
	onSelectAgent,
	onRemoved,
}: ManageTabProps) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
			<ManagePart
				title="Seat"
				hint="Sitting somewhere else never changes its workspace or folder."
			>
				<SeatRow agent={agent} projects={projects} />
			</ManagePart>
			<ManagePart
				title="Hand over"
				hint={`A new agent starts in another workspace with ${agent.name}'s brief.`}
			>
				<HandoverBox
					agent={agent}
					projects={projects}
					handovers={handovers}
					onSelectAgent={onSelectAgent}
				/>
			</ManagePart>
			<ManagePart title="Remove" hint="Ends it and closes its terminal.">
				<RemoveAgent agent={agent} onRemoved={onRemoved} />
			</ManagePart>
		</div>
	);
}
