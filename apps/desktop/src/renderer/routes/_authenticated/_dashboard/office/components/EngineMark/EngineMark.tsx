import { cn } from "@superset/ui/utils";
import antigravityIcon from "renderer/assets/app-icons/antigravity.svg";
import type { EngineId } from "../../types";
import { ENGINE_COLORS, engineLabel } from "../OfficeFloor/constants";

interface EngineMarkProps {
	engine: EngineId | undefined;
	className?: string;
}

/** The mark of the engine a teammate runs on, in that engine's colour. */
export function EngineMark({ engine, className }: EngineMarkProps) {
	if (!engine) return null;
	const color = ENGINE_COLORS[engine];
	const label = engineLabel(engine);
	if (engine === "agy")
		return (
			<img
				src={antigravityIcon}
				alt={label}
				title={label}
				className={cn("size-3.5 shrink-0", className)}
				draggable={false}
			/>
		);
	if (engine === "claude")
		return (
			<svg
				viewBox="0 0 24 24"
				className={cn("size-3.5 shrink-0", className)}
				role="img"
				aria-label={label}
			>
				<title>{label}</title>
				<g stroke={color} strokeWidth="2.6" strokeLinecap="round">
					<line x1="12" y1="3" x2="12" y2="21" />
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
					<line x1="18.4" y1="5.6" x2="5.6" y2="18.4" />
					<line x1="4.2" y1="8.8" x2="19.8" y2="15.2" />
					<line x1="19.8" y1="8.8" x2="4.2" y2="15.2" />
					<line x1="8.8" y1="4.2" x2="15.2" y2="19.8" />
					<line x1="15.2" y1="4.2" x2="8.8" y2="19.8" />
				</g>
			</svg>
		);
	return (
		<svg
			viewBox="0 0 24 24"
			className={cn("size-3.5 shrink-0", className)}
			role="img"
			aria-label={label}
		>
			<title>{label}</title>
			<g fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round">
				<polygon points="12,2.5 20.2,7.2 20.2,16.8 12,21.5 3.8,16.8 3.8,7.2" />
				<polygon points="12,7.5 15.9,9.8 15.9,14.2 12,16.5 8.1,14.2 8.1,9.8" />
			</g>
		</svg>
	);
}
