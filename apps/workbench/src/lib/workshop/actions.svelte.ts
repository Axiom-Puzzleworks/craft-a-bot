/**
 * **The palette's action registry** (WP109, `96-CONTROL-ROOM-V3.md` §2.1,
 * decision 1): a screen says which actions it exposes — *Run campaign*,
 * *Fork from this tick*, *Open in the Studio* — for as long as it is on
 * screen, and the palette lists them beside the routes and the artefacts.
 * Nothing scrapes buttons; a screen registers in an effect and the
 * returned function unregisters when the screen leaves.
 */
import { untrack } from 'svelte';

export interface PaletteAction {
	/** Stable across renders: `campaigns/run`, `run-lab/fork`. */
	id: string;
	title: string;
	/** The screen it belongs to, shown as the hint. */
	screen: string;
	run: () => void;
	/** Registered but not possible right now (nothing selected): listed greyed, `Enter` does nothing. */
	disabled?: boolean | undefined;
}

let registered = $state<PaletteAction[]>([]);

export const paletteActions = {
	get list(): readonly PaletteAction[] {
		return registered;
	}
};

/** Register a screen's actions; call the result to remove them. Re-registering an id replaces it. */
export function registerActions(actions: readonly PaletteAction[]): () => void {
	const ids = actions.map((action) => action.id);
	// Untracked: a screen registers from an effect, and an effect that read the
	// list it writes would re-run itself for ever.
	const others = untrack(() => registered.filter((action) => !ids.includes(action.id)));
	registered = [...others, ...actions];
	return () => {
		registered = untrack(() => registered.filter((action) => !ids.includes(action.id)));
	};
}

/** For tests: forget everything. */
export function resetActions(): void {
	registered = [];
}
