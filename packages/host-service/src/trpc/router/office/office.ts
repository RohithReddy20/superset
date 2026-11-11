import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { CityRooms, CitySnapshot } from "../../../office/cityRooms";
import type { CityTasks, CityTasksSnapshot } from "../../../office/cityTasks";
import type { CityTeam, CityTeamSnapshot } from "../../../office/cityTeam";
import type { OfficeRuntime } from "../../../office/officeRuntime";
import type { OfficeSnapshot } from "../../../office/types";
import { protectedProcedure, router } from "../../index";

function officeOf(runtime: { office?: () => OfficeRuntime }): OfficeRuntime {
	const office = runtime.office?.();
	if (!office) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "The office is not available on this host.",
		});
	}
	return office;
}

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

function tasksOf(runtime: { cityTasks?: () => CityTasks }): CityTasks {
	const tasks = runtime.cityTasks?.();
	if (!tasks) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "City tasks are not available on this host.",
		});
	}
	return tasks;
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

const taskId = z.object({ id: z.string().min(1) });

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
				to: z.array(z.string().min(1)).min(1),
				text: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => {
				const team = teamOf(ctx.runtime);
				return team.say({
					fromId: team.callerOf(input.caller),
					to: input.to,
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

	cityTasks: protectedProcedure.query(
		({ ctx }): CityTasksSnapshot => tasksOf(ctx.runtime).snapshot(),
	),

	cityTaskGive: protectedProcedure
		.input(
			z.object({
				terminalId: z.string().min(1),
				title: z.string().min(1).max(200),
				brief: z.string().max(8000),
				checkCommand: z.string().max(500).optional(),
				checker: z.enum(["claude", "codex"]).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => tasksOf(ctx.runtime).give(input)),
		),

	cityTaskSendBack: protectedProcedure
		.input(taskId.extend({ note: z.string().max(4000) }))
		.mutation(({ ctx, input }) =>
			badRequest(() => tasksOf(ctx.runtime).sendBack(input.id, input.note)),
		),

	cityTaskPullRequest: protectedProcedure
		.input(taskId)
		.mutation(({ ctx, input }) =>
			badRequest(() => tasksOf(ctx.runtime).askForPullRequest(input.id)),
		),

	cityTaskClose: protectedProcedure
		.input(taskId)
		.mutation(({ ctx, input }) =>
			badRequest(() => tasksOf(ctx.runtime).close(input.id)),
		),

	cityTaskCancel: protectedProcedure
		.input(taskId)
		.mutation(({ ctx, input }) =>
			badRequest(() => tasksOf(ctx.runtime).cancel(input.id)),
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

	citySay: protectedProcedure
		.input(place.extend({ text: z.string().min(1).max(4000) }))
		.mutation(({ ctx, input }) =>
			badRequest(async () => {
				await cityOf(ctx.runtime).say(
					input.projectId,
					input.roomId,
					input.text,
				);
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

	cityHandoverApprove: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				toWorkspaceId: z.string().min(1),
				agent: z.string().min(1).optional(),
				note: z.string().max(2000).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			badRequest(() => cityOf(ctx.runtime).approveHandover(input)),
		),

	cityHandoverDecline: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			badRequest(async () => {
				await cityOf(ctx.runtime).declineHandover(input.id);
				return { ok: true as const };
			}),
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
				ctx.runtime.cityTasks?.().dropAgent(input.terminalId);
				return { ok: true as const };
			}),
		),

	state: protectedProcedure.query(({ ctx }): OfficeSnapshot => {
		const office = officeOf(ctx.runtime);
		void office.start();
		return office.snapshot();
	}),

	say: protectedProcedure
		.input(
			z.object({
				authorId: z.string(),
				roomId: z.string(),
				threadId: z.string().nullable().optional(),
				text: z.string().min(1).max(4000),
			}),
		)
		.mutation(({ ctx, input }): { id: string } => {
			try {
				return officeOf(ctx.runtime).say(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
		}),

	setPaused: protectedProcedure
		.input(z.object({ id: z.string(), paused: z.boolean() }))
		.mutation(({ ctx, input }): { ok: true } => {
			officeOf(ctx.runtime).setPaused(input.id, input.paused);
			return { ok: true };
		}),

	hire: protectedProcedure
		.input(
			z.object({
				id: z
					.string()
					.regex(/^[a-z0-9-]{2,24}$/, "lowercase letters, digits and dashes"),
				name: z.string().min(1).max(40),
				role: z.string().min(1).max(300),
				room: z.string(),
				engine: z.enum(["claude", "codex", "agy"]),
				model: z.string().max(80).optional(),
				instructions: z.string().max(4000).optional(),
			}),
		)
		.mutation(({ ctx, input }): { ok: true } => {
			try {
				officeOf(ctx.runtime).hire(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
			return { ok: true };
		}),

	addRoom: protectedProcedure
		.input(
			z.object({
				id: z
					.string()
					.regex(/^[a-z0-9-]{2,24}$/, "lowercase letters, digits and dashes"),
				name: z.string().min(1).max(40),
				place: z.string().max(40).optional(),
			}),
		)
		.mutation(({ ctx, input }): { ok: true } => {
			try {
				officeOf(ctx.runtime).addRoom(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
			return { ok: true };
		}),

	deleteRoom: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ ctx, input }): { ok: true } => {
			try {
				officeOf(ctx.runtime).deleteRoom(input.id);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
			return { ok: true };
		}),

	setDesks: protectedProcedure
		.input(
			z.object({
				desks: z
					.array(
						z.object({
							id: z.string(),
							zoneId: z.string().max(40),
							x: z.number(),
							y: z.number(),
						}),
					)
					.max(200),
			}),
		)
		.mutation(({ ctx, input }): { ok: true } => {
			officeOf(ctx.runtime).setDesks(input.desks);
			return { ok: true };
		}),

	openGroup: protectedProcedure
		.input(
			z.object({
				personId: z.string(),
				memberIds: z.array(z.string()).min(1).max(12),
			}),
		)
		.mutation(({ ctx, input }): { roomId: string } => {
			try {
				return officeOf(ctx.runtime).openGroup(input.personId, input.memberIds);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
		}),

	moveTeammate: protectedProcedure
		.input(z.object({ id: z.string(), roomId: z.string() }))
		.mutation(({ ctx, input }): { ok: true } => {
			try {
				officeOf(ctx.runtime).moveTeammate(input.id, input.roomId);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
			return { ok: true };
		}),

	createTask: protectedProcedure
		.input(
			z.object({
				by: z.string(),
				title: z.string().min(1).max(120),
				brief: z.string().min(1).max(4000),
				roomId: z.string(),
				ownerId: z.string().nullable().optional(),
				verifierId: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }): { id: string } => {
			try {
				return officeOf(ctx.runtime).createTask(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
		}),

	assignTask: protectedProcedure
		.input(z.object({ by: z.string(), id: z.string(), ownerId: z.string() }))
		.mutation(({ ctx, input }): { ok: true } => {
			try {
				officeOf(ctx.runtime).assignTask(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
			return { ok: true };
		}),

	updateTask: protectedProcedure
		.input(
			z.object({
				by: z.string(),
				id: z.string(),
				status: z.enum([
					"todo",
					"doing",
					"review",
					"verified",
					"done",
					"blocked",
				]),
				note: z.string().min(1).max(4000),
			}),
		)
		.mutation(({ ctx, input }): { ok: true } => {
			try {
				officeOf(ctx.runtime).updateTask(input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: (error as Error).message,
				});
			}
			return { ok: true };
		}),

	stop: protectedProcedure.mutation(async ({ ctx }): Promise<{ ok: true }> => {
		await officeOf(ctx.runtime).stop();
		return { ok: true };
	}),
});
