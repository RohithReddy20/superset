import { cn } from "@superset/ui/utils";

interface ProjectIconProps {
	project: { name: string; iconUrl: string | null };
	className?: string;
}

/** A project's own icon, or its first letter on a tile. */
export function ProjectIcon({ project, className }: ProjectIconProps) {
	return project.iconUrl ? (
		<img
			src={project.iconUrl}
			alt=""
			draggable={false}
			className={cn("size-4 shrink-0 rounded-sm object-cover", className)}
		/>
	) : (
		<span
			aria-hidden
			className={cn(
				"flex size-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-medium uppercase text-muted-foreground",
				className,
			)}
		>
			{project.name.slice(0, 1)}
		</span>
	);
}
