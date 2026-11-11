import type { ReactNode } from "react";

interface ManagePartProps {
	title: string;
	hint: string;
	children: ReactNode;
}

export function ManagePart({ title, hint, children }: ManagePartProps) {
	return (
		<section className="flex flex-col gap-1.5">
			<h3 className="text-[12px] font-medium">{title}</h3>
			<p className="text-[11px] text-muted-foreground">{hint}</p>
			{children}
		</section>
	);
}
