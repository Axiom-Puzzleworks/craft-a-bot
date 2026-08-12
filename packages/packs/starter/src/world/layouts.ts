import type { WorldLayout } from '@craftabot/core';
import { entityName, layoutStrings } from '../strings.js';
import type { Cell } from './grid.js';
import type { PlayroomContainer, PlayroomFurniture, PlayroomItem, PlayroomState } from './state.js';

/**
 * The six starting arrangements, one per starter Goal Card (02-AGENT-MODEL.md §3).
 * It is one room, so the furniture never moves between layouts — only what is
 * out on the floor, whether the chest is locked, and where the bot begins.
 */

const WIDTH = 8;
const HEIGHT = 6;

const CHEST: Cell = { x: 1, y: 0 };
const SHELF: Cell = { x: 6, y: 0 };
const TABLE: Cell = { x: 3, y: 2 };
const TEDDY: Cell = { x: 5, y: 4 };
const BOT_START: Cell = { x: 0, y: 4 };

function furniture(): PlayroomFurniture[] {
	return [
		{ id: 'shelf', name: entityName('shelf'), position: { ...SHELF } },
		{ id: 'table', name: entityName('table'), position: { ...TABLE } }
	];
}

function chest(state: PlayroomContainer['state']): PlayroomContainer[] {
	return [
		{
			id: 'toy-chest',
			name: entityName('toy-chest'),
			position: { ...CHEST },
			state,
			unlockedBy: 'red-key'
		}
	];
}

function onFloor(id: string, position: Cell): PlayroomItem {
	return { id, name: entityName(id), location: { kind: 'floor', position: { ...position } } };
}

/** The three blocks, scattered where a child left them. */
function scatteredBlocks(): PlayroomItem[] {
	return [
		onFloor('block-a', { x: 6, y: 1 }),
		onFloor('block-b', { x: 2, y: 3 }),
		onFloor('block-c', { x: 7, y: 4 })
	];
}

function baseState(overrides: {
	chestState: PlayroomContainer['state'];
	items: PlayroomItem[];
}): PlayroomState {
	return {
		width: WIDTH,
		height: HEIGHT,
		tick: 0,
		bot: { position: { ...BOT_START } },
		furniture: furniture(),
		containers: chest(overrides.chestState),
		characters: [{ id: 'teddy', name: entityName('teddy'), position: { ...TEDDY } }],
		items: overrides.items,
		spoken: [],
		heard: [],
		celebrated: false
	};
}

export const playroomLayouts: WorldLayout[] = [
	{
		id: 'greeting',
		name: layoutStrings.greeting,
		initialState: baseState({ chestState: 'closed', items: [] })
	},
	{
		id: 'snack-hunt',
		name: layoutStrings['snack-hunt'],
		// The snack sits on the table: the bot cannot stand there, but it can reach it.
		initialState: baseState({
			chestState: 'closed',
			items: [onFloor('snack', TABLE), onFloor('ball', { x: 4, y: 5 })]
		})
	},
	{
		id: 'tidy-up',
		name: layoutStrings['tidy-up'],
		initialState: baseState({
			chestState: 'closed',
			items: [...scatteredBlocks(), onFloor('ball', { x: 4, y: 5 })]
		})
	},
	{
		id: 'locked-chest',
		name: layoutStrings['locked-chest'],
		// Same as tidy-up, but the lid is locked and the key is off in a far corner.
		initialState: baseState({
			chestState: 'locked',
			items: [
				...scatteredBlocks(),
				onFloor('red-key', { x: 0, y: 0 }),
				onFloor('ball', { x: 4, y: 5 })
			]
		})
	},
	{
		id: 'sums',
		name: layoutStrings.sums,
		initialState: baseState({ chestState: 'closed', items: [] })
	},
	{
		id: 'free-play',
		name: layoutStrings['free-play'],
		initialState: baseState({
			chestState: 'locked',
			items: [
				onFloor('snack', TABLE),
				...scatteredBlocks(),
				onFloor('red-key', { x: 0, y: 0 }),
				onFloor('ball', { x: 4, y: 5 })
			]
		})
	}
];
