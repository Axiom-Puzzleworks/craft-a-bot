import { describe, expect, it } from 'vitest';
import {
	blockerAt,
	findCharacter,
	findContainer,
	findItem,
	itemCell,
	itemsHeldBy,
	itemsInContainer,
	itemsOnFloorAt
} from './state.js';
import { carried, heldBy, inContainer, onFloor, testState } from './test-state.js';

describe('lookups', () => {
	it('find helpers return the entity or undefined', () => {
		const state = testState({ items: [onFloor('ball', { x: 1, y: 1 })] });
		expect(findItem(state, 'ball')?.id).toBe('ball');
		expect(findItem(state, 'nope')).toBeUndefined();
		expect(findCharacter(state, 'teddy')?.name).toBe('Teddy');
		expect(findCharacter(state, 'nope')).toBeUndefined();
		expect(findContainer(state, 'toy-chest')?.state).toBe('closed');
		expect(findContainer(state, 'nope')).toBeUndefined();
	});
});

describe('blockerAt', () => {
	it('reports furniture, containers, and characters as occupying their cell', () => {
		const state = testState();
		expect(blockerAt(state, { x: 4, y: 2 })?.id).toBe('table');
		expect(blockerAt(state, { x: 3, y: 3 })?.id).toBe('toy-chest');
		expect(blockerAt(state, { x: 5, y: 3 })?.id).toBe('teddy');
	});

	it('reports empty rug as unblocked', () => {
		expect(blockerAt(testState(), { x: 0, y: 5 })).toBeUndefined();
	});
});

describe('item grouping', () => {
	const state = testState({
		items: [
			onFloor('ball', { x: 1, y: 1 }),
			onFloor('snack', { x: 1, y: 1 }),
			inContainer('block-a', 'toy-chest'),
			heldBy('block-b', 'teddy')
		]
	});

	it('lists items sharing a floor cell', () => {
		expect(itemsOnFloorAt(state, { x: 1, y: 1 }).map((item) => item.id)).toEqual(['ball', 'snack']);
		expect(itemsOnFloorAt(state, { x: 7, y: 5 })).toEqual([]);
	});

	it('lists items by container and by holder', () => {
		expect(itemsInContainer(state, 'toy-chest').map((item) => item.id)).toEqual(['block-a']);
		expect(itemsHeldBy(state, 'teddy').map((item) => item.id)).toEqual(['block-b']);
	});
});

describe('itemCell', () => {
	it('resolves a physical cell for every location kind', () => {
		const state = testState({
			items: [
				onFloor('ball', { x: 1, y: 1 }),
				inContainer('block-a', 'toy-chest'),
				heldBy('block-b', 'teddy'),
				carried('snack')
			]
		});
		const cellOf = (id: string) => {
			const item = findItem(state, id);
			if (!item) throw new Error(`missing fixture item: ${id}`);
			return itemCell(state, item);
		};
		expect(cellOf('ball')).toEqual({ x: 1, y: 1 });
		expect(cellOf('block-a')).toEqual({ x: 3, y: 3 });
		expect(cellOf('block-b')).toEqual({ x: 5, y: 3 });
		expect(cellOf('snack')).toEqual({ x: 4, y: 3 });
	});

	it('is undefined when the referenced container or character is gone', () => {
		const state = testState({
			containers: [],
			characters: [],
			items: [inContainer('block-a', 'toy-chest'), heldBy('block-b', 'teddy')]
		});
		const orphanContainer = findItem(state, 'block-a');
		const orphanHolder = findItem(state, 'block-b');
		if (!orphanContainer || !orphanHolder) throw new Error('missing fixture items');
		expect(itemCell(state, orphanContainer)).toBeUndefined();
		expect(itemCell(state, orphanHolder)).toBeUndefined();
	});
});
