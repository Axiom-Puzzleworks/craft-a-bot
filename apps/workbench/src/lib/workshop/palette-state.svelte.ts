/**
 * Whether the command palette is open (WP109, `96-CONTROL-ROOM-V3.md` §2.1):
 * the layout's `Ctrl+K` and the rail's *Go to…* both open it; the dialog
 * closes itself. A rune store so the three agree without props.
 */
let open = $state(false);

export const paletteState = {
	get isOpen(): boolean {
		return open;
	},
	open(): void {
		open = true;
	},
	close(): void {
		open = false;
	},
	toggle(): void {
		open = !open;
	}
};
