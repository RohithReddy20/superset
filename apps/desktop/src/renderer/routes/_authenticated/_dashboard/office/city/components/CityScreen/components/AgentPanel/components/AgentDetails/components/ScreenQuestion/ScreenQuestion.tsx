import { Button } from "@superset/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuHand } from "react-icons/lu";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useAgentInput } from "../../../../../../../../hooks/useAgentInput";
import { useAgentScreens } from "../../../../../../../../hooks/useAgentScreens";
import type { CityAgent } from "../../../../../../../../types";
import { keysToChoose } from "../../../../../../../../utils/screenAsk";

interface ScreenQuestionProps {
	agent: Pick<CityAgent, "terminalId" | "workspaceId" | "name">;
}

/** A question the agent shows on its screen, with one button per answer. */
export function ScreenQuestion({ agent }: ScreenQuestionProps) {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const input = useAgentInput();
	const ask = useAgentScreens([agent]).get(agent.terminalId);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	if (!ask) return null;

	const choose = async (index: number) => {
		setSending(true);
		setError(null);
		try {
			await input.pressAll(agent, keysToChoose(ask, index));
			await queryClient.invalidateQueries({
				queryKey: ["city", "screen", activeHostUrl, agent.terminalId],
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSending(false);
		}
	};

	return (
		<section
			aria-label={`${agent.name} asks`}
			className="flex flex-col gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 p-2"
		>
			<p className="flex items-start gap-1.5 text-[12px]">
				<LuHand className="mt-0.5 size-3.5 shrink-0 text-orange-500" />
				<span>
					<span className="font-medium">{agent.name} asks:</span>{" "}
					{ask.question || "a question on its screen"}
				</span>
			</p>
			<div className="flex flex-col gap-1">
				{ask.options.map((option, index) => (
					<Button
						key={option}
						variant="outline"
						size="sm"
						disabled={sending}
						onClick={() => void choose(index)}
						className="h-auto justify-start whitespace-normal bg-background py-1 text-left text-[12px] font-normal"
					>
						{option}
					</Button>
				))}
			</div>
			{error ? <p className="text-[11px] text-red-500">{error}</p> : null}
		</section>
	);
}
