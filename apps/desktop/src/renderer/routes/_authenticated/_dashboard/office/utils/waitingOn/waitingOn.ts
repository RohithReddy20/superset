import type { CityNote, CityTodo } from "../../city/types";
import { isOpenTodo, YOU } from "../../city/types";

type AskedTodo = Pick<
	CityTodo,
	"ownerId" | "state" | "askedById" | "createdAt"
>;

/**
 * The item an agent asked of a teammate who has not written back to it yet. An ask stays open on
 * the teammate's list after the answer, so the answer is what ends the wait.
 */
export function waitingOn<Todo extends AskedTodo>(
	terminalId: string,
	todos: Todo[],
	notes: Pick<CityNote, "fromId" | "toIds" | "at">[],
): Todo | undefined {
	return todos.find(
		(t) =>
			isOpenTodo(t) &&
			t.askedById === terminalId &&
			t.ownerId !== terminalId &&
			t.ownerId !== YOU &&
			!notes.some(
				(n) =>
					n.fromId === t.ownerId &&
					n.toIds.includes(terminalId) &&
					n.at >= t.createdAt,
			),
	);
}
