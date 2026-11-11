export { Office, type OfficeOptions } from "./office/Office";
export * from "./office/types";
export {
	adapterEntry,
	ENGINES,
	type EngineLaunch,
	type EngineSpec,
	whichOnPath,
} from "./seat/engines";
export { inboxPrompt, normsDocument } from "./seat/prompt";
export { Seat, type SeatOptions } from "./seat/Seat";
export { handleMcpRequest, officeToolsServer } from "./tools/officeMcp";
