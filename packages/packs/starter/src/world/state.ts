import type { Cell } from './grid.js';
import { sameCell } from './grid.js';

/**
 * The Playroom's world state (02-AGENT-MODEL.md §4). Declared with `type`
 * rather than `interface` so it stays structurally assignable to core's
 * `WorldState = Record<string, unknown>`; interfaces get no implicit index
 * signature. Everything here is plain JSON — it is snapshotted into the trace.
 */

export type ItemLocation =
	| { kind: 'floor'; position: Cell }
	| { kind: 'carried' }
	| { kind: 'held-by'; characterId: string }
	| { kind: 'in-container'; containerId: string };

export type PlayroomItem = {
	id: string;
	name: string;
	location: ItemLocation;
};

export type PlayroomCharacter = {
	id: string;
	name: string;
	position: Cell;
};

export type ContainerState = 'open' | 'closed' | 'locked';

export type PlayroomContainer = {
	id: string;
	name: string;
	position: Cell;
	state: ContainerState;
	/** Item id of the key that unlocks it, when locked. */
	unlockedBy: string | null;
};

export type PlayroomFurniture = {
	id: string;
	name: string;
	position: Cell;
};

export type SpokenLine = {
	tick: number;
	text: string;
	/** Where the bot stood when it spoke — the "within 2 squares" predicate needs this. */
	position: Cell;
};

export type PlayroomState = {
	width: number;
	height: number;
	tick: number;
	/**
	 * What the bot is carrying is stored *only* on the item (`location.kind ===
	 * 'carried'`), never mirrored here — one source of truth means "carrying two
	 * things" is unrepresentable rather than merely forbidden. The one-item-at-a-time
	 * limit (02-AGENT-MODEL.md §4) is then enforced by `carriedItem()`.
	 */
	bot: { position: Cell };
	furniture: PlayroomFurniture[];
	containers: PlayroomContainer[];
	characters: PlayroomCharacter[];
	items: PlayroomItem[];
	spoken: SpokenLine[];
	/** User messages awaiting the Hearing channel; drained when observed. */
	heard: string[];
	celebrated: boolean;
};

/** One field-level change, as `ActionResult.stateDiff` for the trace drawer (03-UI-UX-DESIGN.md §5.2). */
export type StateChange = {
	path: string;
	from: unknown;
	to: unknown;
};

export function findItem(state: PlayroomState, id: string): PlayroomItem | undefined {
	return state.items.find((item) => item.id === id);
}

export function findCharacter(state: PlayroomState, id: string): PlayroomCharacter | undefined {
	return state.characters.find((character) => character.id === id);
}

export function findContainer(state: PlayroomState, id: string): PlayroomContainer | undefined {
	return state.containers.find((container) => container.id === id);
}

/** Furniture, containers, and characters all take up a cell the bot cannot enter. */
export function blockerAt(
	state: PlayroomState,
	cell: Cell
): { id: string; name: string } | undefined {
	return (
		state.furniture.find((piece) => sameCell(piece.position, cell)) ??
		state.containers.find((container) => sameCell(container.position, cell)) ??
		state.characters.find((character) => sameCell(character.position, cell))
	);
}

export function itemsOnFloorAt(state: PlayroomState, cell: Cell): PlayroomItem[] {
	return state.items.filter(
		(item) => item.location.kind === 'floor' && sameCell(item.location.position, cell)
	);
}

export function itemsInContainer(state: PlayroomState, containerId: string): PlayroomItem[] {
	return state.items.filter(
		(item) => item.location.kind === 'in-container' && item.location.containerId === containerId
	);
}

export function itemsHeldBy(state: PlayroomState, characterId: string): PlayroomItem[] {
	return state.items.filter(
		(item) => item.location.kind === 'held-by' && item.location.characterId === characterId
	);
}

/** Where an item physically sits, for reach checks — undefined when carried by the bot. */
export function itemCell(state: PlayroomState, item: PlayroomItem): Cell | undefined {
	switch (item.location.kind) {
		case 'floor':
			return item.location.position;
		case 'in-container':
			return findContainer(state, item.location.containerId)?.position;
		case 'held-by':
			return findCharacter(state, item.location.characterId)?.position;
		case 'carried':
			return state.bot.position;
	}
}
