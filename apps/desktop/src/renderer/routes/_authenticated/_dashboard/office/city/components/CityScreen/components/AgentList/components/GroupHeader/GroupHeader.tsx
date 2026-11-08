import type { ReactNode } from "react";

export function GroupHeader({
	icon,
	name,
	detail,
}: {
	icon: ReactNode;
	name: string;
	detail: string;
}) {
	return (
		<h3 className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[12px] font-medium">
			{icon}
			{name}
			<span className="font-normal text-muted-foreground">{detail}</span>
		</h3>
	);
}
