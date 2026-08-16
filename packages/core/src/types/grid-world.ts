/**
 * **The shared grid-world shape** (WP28) — the minimal vocabulary a room
 * needs to be *drawn*, not the whole of what a world's state is.
 *
 * Extracted from `@craftabot/pack-starter`'s `PlayroomState`, which the
 * workbench's `WorldView` imported by name — meaning a second grid-based
 * world pack could not render at all without depending on the *first* one,
 * backwards from how packs are supposed to relate. `WorldView` only ever
 * reads `width`/`height`/`bot`/`furniture`/`containers`/`characters`/`items`;
 * everything else a world's state carries (the Playroom's `spoken`, `heard`,
 * `celebrated`) is that world's own business and stays there.
 *
 * A world's real state type is still its own — `PlayroomState` is not
 * replaced, it is now defined so it is *structurally* a `GridWorldState`
 * (every field below, plus whatever else the Playroom needs), which is what
 * lets the same rendering component draw any world that shares this floor
 * without either world pack importing the other.
 */

export type GridPosition = { x: number; y: number };

export type GridWorldFurniture = {
	id: string;
	name: string;
	position: GridPosition;
};

export type GridWorldContainerState = 'open' | 'closed' | 'locked';

export type GridWorldContainer = {
	id: string;
	name: string;
	position: GridPosition;
	state: GridWorldContainerState;
};

export type GridWorldCharacter = {
	id: string;
	name: string;
	position: GridPosition;
};

export type GridWorldItemLocation =
	| { kind: 'floor'; position: GridPosition }
	| { kind: 'carried' }
	| { kind: 'held-by'; characterId: string }
	| { kind: 'in-container'; containerId: string };

export type GridWorldItem = {
	id: string;
	name: string;
	location: GridWorldItemLocation;
};

/** What `WorldView` needs to draw a room (`03-…` §5.1) — nothing more. */
export type GridWorldState = {
	width: number;
	height: number;
	bot: { position: GridPosition };
	furniture: GridWorldFurniture[];
	containers: GridWorldContainer[];
	characters: GridWorldCharacter[];
	items: GridWorldItem[];
};
