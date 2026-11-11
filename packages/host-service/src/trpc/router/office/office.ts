import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { CityRooms, CitySnapshot } from "../../../office/cityRooms";
import type { CityTeam, CityTeamSnapshot } from "../../../office/cityTeam";
import { protectedProcedure, router } from "../../index";

function cityOf(runtime: { city?: () => CityRooms }): CityRooms {
	const city = runtime.city?.();
	if (!city) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "The city is not available on this host.",
		});
	}
	return city;
}

function teamOf(runtime: { cityTeam?: () => CityTeam }): CityTeam {
	const team = runtime.cityTeam?.();
	if (!team) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "The team is not available on this host.",
		});
	}
	return team;
}

async function badRequest<T>(run: () => Promise<T> | T): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: (error as Error).message,
		});
	}
}

const place = z.object({
	projectId: z.string().min(1),
	roomId: z.string().min(1),
});

/** The terminal a command was run from; unset or unknown means the person. */
const caller = z.string().min(1).optional();

export const officeRouter = router({
	cityState: protectedProcedure.query(
		({ ctx }): CitySnapshot => cityOf(ctx.runtime).snapshot(),
	),

	team: protectedProcedure.query(
		({ ctx }): CityTeamSnapshot => teamOf(ctx.runtime).snapshot(),
	),

	teamSay: protectedProcedure
		.input(
			z.object({
				caller,
				to: z.array(z.string().min(1)).default([]),
				/** Everyone sitting in this room. */
				room: place.optional(),
				text: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => {
				const team = teamOf(ctx.runtime);
				return team.say({
					fromId: team.callerOf(input.caller),
					to: input.to,
					...(input.room ? { room: input.room } : {}),
					text: input.text,
				});
			}),
		),

	teamAsk: protectedProcedure
		.input(
			z.object({
				caller,
				to: z.string().min(1),
				text: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => {
				const team = teamOf(ctx.runtime);
				return team.ask({
					fromId: team.callerOf(input.caller),
					to: input.to,
					text: input.text,
				});
			}),
		),

	teamDecide: protectedProcedure
		.input(
			z.object({
				caller,
				room: place.optional(),
				text: z.string().min(1),
				gives: z
					.array(z.object({ to: z.string().min(1), text: z.string().min(1) }))
					.default([]),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => {
				const team = teamOf(ctx.runtime);
				return team.decide({
					fromId: team.callerOf(input.caller),
					...(input.room ? { room: input.room } : {}),
					text: input.text,
					gives: input.gives,
				});
			}),
		),

	teamHandover: protectedProcedure
		.input(
			z.object({
				caller,
				to: z.string().min(1),
				agent: z.string().min(1).optional(),
				brief: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(async () => {
				const city = cityOf(ctx.runtime);
				const from = teamOf(ctx.runtime).callerOf(input.caller);
				if (from === "you")
					throw new Error(
						"Run this from the terminal of the agent whose work moves",
					);
				const handover = await city.handOverWithBrief({
					terminalId: from,
					toWorkspaceId: city.workspaceIdFor(input.to),
					...(input.agent ? { agent: input.agent } : {}),
					brief: input.brief,
				});
				return {
					workspace: handover.toWorkspaceName ?? "",
					newTerminalId: handover.newTerminalId ?? null,
				};
			}),
		),

	teamTimeline: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.query(({ ctx, input }) => teamOf(ctx.runtime).timeline(input.id)),

	teamRead: protectedProcedure
		.input(z.object({ fromId: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			teamOf(ctx.runtime).markRead(input.fromId);
			return { ok: true as const };
		}),

	teamTodoAdd: protectedProcedure
		.input(z.object({ caller, text: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			badRequest(() => {
				const team = teamOf(ctx.runtime);
				return team.addTodo({
					callerId: team.callerOf(input.caller),
					text: input.text,
				});
			}),
		),

	teamTodoSet: protectedProcedure
		.input(
			z.object({
				caller,
				id: z.string().min(1),
				state: z.enum(["open", "doing", "finished", "dropped"]),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => {
				const team = teamOf(ctx.runtime);
				return team.setTodo({
					callerId: team.callerOf(input.caller),
					id: input.id,
					state: input.state,
				});
			}),
		),

	citySeat: protectedProcedure
		.input(place.extend({ terminalId: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			badRequest(async () => {
				await cityOf(ctx.runtime).seat(
					input.terminalId,
					input.projectId,
					input.roomId,
				);
				return { ok: true as const };
			}),
		),

	cityHome: protectedProcedure
		.input(z.object({ terminalId: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			badRequest(async () => {
				await cityOf(ctx.runtime).sendHome(input.terminalId);
				return { ok: true as const };
			}),
		),

	cityHandOver: protectedProcedure
		.input(
			z.object({
				terminalId: z.string().min(1),
				toWorkspaceId: z.string().min(1),
				agent: z.string().min(1).optional(),
				note: z.string().max(2000).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => cityOf(ctx.runtime).handOver(input)),
		),

	cityHandoverCancel: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			badRequest(() => {
				cityOf(ctx.runtime).cancelHandover(input.id);
				return { ok: true as const };
			}),
		),

	cityStart: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().min(1),
				agent: z.string().min(1),
				prompt: z.string().max(8000).default(""),
				name: z.string().max(100).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => cityOf(ctx.runtime).start(input)),
		),

	cityRename: protectedProcedure
		.input(
			z.object({
				terminalId: z.string().min(1),
				name: z.string().min(1).max(100),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => {
				cityOf(ctx.runtime).rename(input.terminalId, input.name);
				return { ok: true as const };
			}),
		),

	cityTell: protectedProcedure
		.input(
			z.object({
				terminalId: z.string().min(1),
				text: z.string().min(1).max(8000),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(async () => {
				await cityOf(ctx.runtime).tell(input.terminalId, input.text);
				return { ok: true as const };
			}),
		),

	cityReconnect: protectedProcedure
		.input(z.object({ terminalId: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			badRequest(() => cityOf(ctx.runtime).reconnect(input.terminalId)),
		),

	cityRemove: protectedProcedure
		.input(z.object({ terminalId: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			badRequest(async () => {
				await cityOf(ctx.runtime).remove(input.terminalId);
				return { ok: true as const };
			}),
		),
});
