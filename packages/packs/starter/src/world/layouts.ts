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

function inChest(id: string): PlayroomItem {
	return { id, name: entityName(id), location: { kind: 'in-container', containerId: 'toy-chest' } };
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
		/*
		 * Two blocks, both on the chest's side of the room (`16-…` §1.1).
		 *
		 * Three scattered blocks took about 34 turns to tidy optimally, against
		 * a 30-tick platform floor — so this card could not be won by any bot
		 * ever built, and said nothing about it (`12-…` C6). Re-scoping the card
		 * rather than raising the floor keeps the floor as the governance
		 * teaching point it exists to be. The optimal solution is now 10 turns
		 * (see the card's `par`), which leaves a bot that has to find the blocks
		 * with one square of sight the room to be inefficient in.
		 */
		initialState: baseState({
			chestState: 'closed',
			items: [
				onFloor('block-a', { x: 3, y: 1 }),
				onFloor('block-b', { x: 2, y: 3 }),
				onFloor('ball', { x: 4, y: 5 })
			]
		})
	},
	{
		id: 'locked-chest',
		name: layoutStrings['locked-chest'],
		/*
		 * The chest is locked with two blocks already inside and one left out:
		 * "open it and put one block away" (`16-…` §1.1). The key sits inboard
		 * near the table rather than in the far corner, where a bot with one
		 * square of sight could only find it by exhausting the wall. Optimal is
		 * 13 turns; the lesson — the chest needs a key, and the key needs a free
		 * hand — is untouched.
		 */
		initialState: baseState({
			chestState: 'locked',
			items: [
				inChest('block-a'),
				inChest('block-b'),
				onFloor('block-c', { x: 2, y: 3 }),
				onFloor('red-key', { x: 2, y: 2 }),
				onFloor('ball', { x: 4, y: 5 })
			]
		})
	},
	{
		id: 'locked-chest-expert',
		name: layoutStrings['locked-chest-expert'],
		// V1.0's locked chest exactly as it was: three scattered blocks, the key
		// in the far corner. Unwinnable in 30 turns and now honest about it —
		// this is the card the step-budget dial exists for.
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
