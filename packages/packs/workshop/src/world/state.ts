import type {
	GridWorldCharacter,
	GridWorldContainer,
	GridWorldFurniture,
	GridWorldItem
} from '@craftabot/core';
import type { Cell } from './grid.js';

/**
 * The Workshop's world state (WP28) — structurally a `GridWorldState`
 * (`@craftabot/core`), so it draws through the same `WorldView` the Playroom
 * does, plus the one thing this world adds: paint, and whether it has dried
 * onto something. Declared with `type`, matching the Playroom's own
 * convention, so it stays structurally assignable to core's opaque
 * `WorldState`.
 *
 * `containers`/`characters` stay in the shape purely so this type satisfies
 * `GridWorldState` — the Workshop has neither. Nobody ever puts anything in
 * either array; the room has no lockable chest and nobody to talk to.
 */

export type WorkshopItem = GridWorldItem & {
	/** Set the moment `paint` succeeds, and never cleared — there is no `unpaint`. */
	painted?: { color: string };
};

export type WorkshopFurniture = GridWorldFurniture;

export type WorkshopState = {
	width: number;
	height: number;
	tick: number;
	/**
	 * `hasPaint` is set the moment the bot is ever within reach of the paint
	 * pot, and never cleared — the pot is bottomless, so "found the paint pot"
	 * and "carrying paint" are the same fact. Without this, `paint` would need
	 * the bot standing within reach of the pot *and* the target at once, which
	 * a room with the pot and the birdhouse in opposite corners can never
	 * satisfy (WP28 — caught before this shipped).
	 */
	bot: { position: Cell; hasPaint: boolean };
	furniture: WorkshopFurniture[];
	containers: GridWorldContainer[];
	characters: GridWorldCharacter[];
	items: WorkshopItem[];
};

export function findItem(state: WorkshopState, id: string): WorkshopItem | undefined {
	return state.items.find((item) => item.id === id);
}

export function findFurniture(state: WorkshopState, id: string): WorkshopFurniture | undefined {
	return state.furniture.find((piece) => piece.id === id);
}

/**
 * Matching what the model typed against what the room actually has.
 *
 * The Playroom's `resolveNamed` (`world/state.ts`) survives articles, case,
 * punctuation and parenthetical letters — a real fix for a real bug there.
 * This world has one paintable item and one paint station, so an exact id-or-
 * name match (case-insensitive) is the whole of what is needed; reaching for
 * the fuller algorithm here would be solving a problem this room does not
 * have.
 */
export function resolveByIdOrName<T extends { id: string; name: string }>(
	candidates: readonly T[],
	query: string
): T | undefined {
	const needle = query.trim().toLowerCase();
	return (
		candidates.find((candidate) => candidate.id === query) ??
		candidates.find((candidate) => candidate.name.toLowerCase() === needle) ??
		candidates.find((candidate) => candidate.name.toLowerCase().includes(needle))
	);
}
