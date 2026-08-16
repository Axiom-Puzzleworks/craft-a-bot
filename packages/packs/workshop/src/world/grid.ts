import type { GridPosition } from '@craftabot/core';

/**
 * Grid geometry for the Workshop (WP28) — a small room with `y = 0` at the
 * north wall. Pure functions only, deliberately duplicated from
 * `pack-starter`'s own `grid.ts` rather than imported: each world pack owns
 * its own movement rules (`14-…` §4.5), and this world's are the Playroom's
 * exact rules, not a dependency on it. `Cell` is `@craftabot/core`'s
 * `GridPosition` under a local name, so this world's state stays a
 * `GridWorldState` for free.
 */

export type Cell = GridPosition;

export const ORTHOGONAL_DIRECTIONS = ['north', 'south', 'east', 'west'] as const;
export type Direction = (typeof ORTHOGONAL_DIRECTIONS)[number];

const DIRECTION_VECTORS: Record<Direction, Cell> = {
	north: { x: 0, y: -1 },
	south: { x: 0, y: 1 },
	east: { x: 1, y: 0 },
	west: { x: -1, y: 0 }
};

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

/** Chebyshev (king-move) distance, matching the Playroom's one metric. */
export function distance(a: Cell, b: Cell): number {
	return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Reach == sight radius 1: the bot's own cell plus its eight neighbours. */
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
