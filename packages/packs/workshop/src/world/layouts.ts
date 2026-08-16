import { entityNames, layoutStrings } from '../strings.js';
import type { WorkshopState } from './state.js';

/**
 * The Workshop's one layout (WP28). 6×5 — deliberately not the Playroom's
 * 8×6, so the room draws through `WorldView`'s own considered fallback (a
 * plain grid, not a picture stretched to fit) rather than borrowing the
 * Playroom's backdrop by coincidence of matching size. No art exists for a
 * second room yet (`11-…`'s dated amendment records why); the plain grid is
 * the honest state until it does.
 */

const WIDTH = 6;
const HEIGHT = 5;

const PAINT_POT = { x: 0, y: 0 };
const WORKBENCH = { x: 3, y: 2 };
const BIRDHOUSE_START = { x: 5, y: 4 };
const BOT_START = { x: 0, y: 4 };

function baseState(): WorkshopState {
	return {
		width: WIDTH,
		height: HEIGHT,
		tick: 0,
		bot: { position: { ...BOT_START }, hasPaint: false },
		furniture: [
			{
				id: 'paint-pot',
				name: entityNames['paint-pot'] ?? 'paint-pot',
				position: { ...PAINT_POT }
			},
			{ id: 'workbench', name: 'the workbench', position: { ...WORKBENCH } }
		],
		containers: [],
		characters: [],
		items: [
			{
				id: 'birdhouse',
				name: entityNames.birdhouse ?? 'birdhouse',
				location: { kind: 'floor', position: { ...BIRDHOUSE_START } }
			}
		]
	};
}

export const workshopLayouts = [
	{
		id: 'the-workshop',
		name: layoutStrings['the-workshop'],
		initialState: baseState()
	}
];
