/**
 * Grid geometry for the Playroom (02-AGENT-MODEL.md §4): an 8×6 room with
 * `y = 0` at the north wall. Pure functions only — no state, no randomness.
 */

export type Cell = { x: number; y: number };

export const ORTHOGONAL_DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export type Direction = (typeof ORTHOGONAL_DIRECTIONS)[number];

const DIRECTION_VECTORS: Record<Direction, Cell> = {
	north: { x: 0, y: -1 },
	south: { x: 0, y: 1 },
	east: { x: 1, y: 0 },
	west: { x: -1, y: 0 }
};

/** Where something is relative to the bot, as the observation text says it. */
export type RelativeDirection =
	| 'here'
	| 'north'
	| 'north-east'
	| 'east'
	| 'south-east'
	| 'south'
	| 'south-west'
	| 'west'
	| 'north-west';

export function step(from: Cell, direction: Direction): Cell {
	const vector = DIRECTION_VECTORS[direction];
	return { x: from.x + vector.x, y: from.y + vector.y };
}

export function inBounds(cell: Cell, width: number, height: number): boolean {
	return cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < height;
}

export function sameCell(a: Cell, b: Cell): boolean {
	return a.x === b.x && a.y === b.y;
}

/** Chebyshev (king-move) distance — the Playroom's one distance metric. */
export function distance(a: Cell, b: Cell): number {
	return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Reach == sight radius 1 (02-AGENT-MODEL.md §4): the bot's own cell plus its
 * eight neighbours. Deliberately one rule for seeing, picking up, opening, and
 * giving, so there is only one thing to learn.
 */
export function withinReach(a: Cell, b: Cell): boolean {
	return distance(a, b) <= 1;
}

/** The nine cells the bot can see and reach, clipped to the room. */
export function neighbourhood(centre: Cell, width: number, height: number): Cell[] {
	const cells: Cell[] = [];
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const cell = { x: centre.x + dx, y: centre.y + dy };
			if (inBounds(cell, width, height)) cells.push(cell);
		}
	}
	return cells;
}

/** Coarse compass bearing from one cell to another; 'here' when they coincide. */
export function relativeDirection(from: Cell, to: Cell): RelativeDirection {
	const dx = Math.sign(to.x - from.x);
	const dy = Math.sign(to.y - from.y);
	if (dx === 0 && dy === 0) return 'here';
	if (dy < 0 && dx < 0) return 'north-west';
	if (dy < 0 && dx > 0) return 'north-east';
	if (dy > 0 && dx < 0) return 'south-west';
	if (dy > 0 && dx > 0) return 'south-east';
	if (dy < 0) return 'north';
	if (dy > 0) return 'south';
	if (dx < 0) return 'west';
	return 'east';
}
