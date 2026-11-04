import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";

export type OfficeSnapshot = inferRouterOutputs<AppRouter>["office"]["state"];
export type Teammate = OfficeSnapshot["teammates"][number];
export type Room = OfficeSnapshot["rooms"][number];
export type Message = OfficeSnapshot["messages"][number];
export type Handoff = OfficeSnapshot["handoffs"][number];
export type EngineId = NonNullable<Teammate["engine"]>;
