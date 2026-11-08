export function EmptyState({ text }: { text: string }) {
	return (
		<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
			{text}
		</div>
	);
}
