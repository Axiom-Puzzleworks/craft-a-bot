import type { Cell } from './grid.js';
import type { PlayroomContainer, PlayroomItem, PlayroomState } from './state.js';

/**
 * A small, explicit Playroom for unit tests — deliberately not one of the
 * shipped layouts, so a legality test never breaks just because a block moved.
 */
export function testState(overrides: Partial<PlayroomState> = {}): PlayroomState {
	return {
		width: 8,
		height: 6,
		tick: 0,
		bot: { position: { x: 4, y: 3 } },
		furniture: [{ id: 'table', name: 'the table', position: { x: 4, y: 2 } }],
		containers: [
			{
				id: 'toy-chest',
				name: 'the toy chest',
				position: { x: 3, y: 3 },
				state: 'closed',
				unlockedBy: 'red-key'
			}
		],
		characters: [{ id: 'teddy', name: 'Teddy', position: { x: 5, y: 3 } }],
		items: [],
		spoken: [],
		heard: [],
		celebrated: false,
		...overrides
	};
}

export function onFloor(id: string, position: Cell, name = id): PlayroomItem {
	return { id, name, location: { kind: 'floor', position } };
}

export function carried(id: string, name = id): PlayroomItem {
	return { id, name, location: { kind: 'carried' } };
}

export function inContainer(id: string, containerId: string, name = id): PlayroomItem {
	return { id, name, location: { kind: 'in-container', containerId } };
}

export function heldBy(id: string, characterId: string, name = id): PlayroomItem {
	return { id, name, location: { kind: 'held-by', characterId } };
}

export function chest(state: PlayroomContainer['state'], position: Cell = { x: 3, y: 3 }) {
	return [
		{
			id: 'toy-chest',
			name: 'the toy chest',
			position,
			state,
			unlockedBy: 'red-key'
		} satisfies PlayroomContainer
	];
}
