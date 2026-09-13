/**
 * **Focus return** (WP110, `97-ACCESS.md` §1; `83-…` §6.7.3): what every
 * drawer does on close — the focus goes back to what opened it. Capture the
 * opener when the drawer opens (`captureOpener`), and on close hand it back
 * (`returnFocus`). Nothing here traps; the palette and the Kit's dialogs use
 * `focus-trap.ts` for that.
 */
export function captureOpener(): HTMLElement | undefined {
	if (typeof document === 'undefined') return undefined;
	const active = document.activeElement;
	return active instanceof HTMLElement && active !== document.body ? active : undefined;
}

export function returnFocus(opener: HTMLElement | undefined): void {
	if (!opener || !opener.isConnected) return;
	opener.focus();
}
