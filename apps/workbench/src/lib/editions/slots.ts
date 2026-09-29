import type { PackManifest } from '@craftabot/core';

/**
 * **A desk loaded on demand** (WP112, `101-…`; `84-…` §8 item 16): the pack's
 * id and its dynamic import, so the bundler gives each desk its own chunk and
 * the Kit's first page carries none of the seven.
 */
export interface DeskLoader {
	id: string;
	load: () => Promise<PackManifest>;
}

/** One place in an edition's pack list: a pack in the first bundle, or a desk loaded later. */
export type EditionSlot = PackManifest | DeskLoader;

export const isDeskLoader = (slot: EditionSlot): slot is DeskLoader =>
	typeof (slot as DeskLoader).load === 'function';

/** A desk's slot: its id and the module that default-exports its manifest. */
export const desk = (id: string, load: () => Promise<{ default: PackManifest }>): DeskLoader => ({
	id,
	load: () => load().then((module) => module.default)
});
