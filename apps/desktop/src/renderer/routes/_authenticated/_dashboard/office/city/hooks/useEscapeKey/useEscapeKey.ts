import { useEffect, useRef } from "react";

const EDITABLE = "input, textarea, select, [contenteditable=true]";

/**
 * Calls `onEscape` for an Esc that nothing else took. A popover or menu closes itself first, and
 * Esc in a field only leaves the field.
 */
export function useEscapeKey(onEscape: () => void): void {
	const handler = useRef(onEscape);
	handler.current = onEscape;
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			const target = event.target instanceof HTMLElement ? event.target : null;
			if (target?.matches(EDITABLE)) {
				target.blur();
				return;
			}
			handler.current();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
}
