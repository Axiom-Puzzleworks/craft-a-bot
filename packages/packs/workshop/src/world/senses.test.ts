import { describe, expect, it } from 'vitest';
import { workshopLayouts } from './layouts.js';
import { SENSE_SIGHT, SENSE_SMELL, observeWorkshop, workshopSenses } from './senses.js';
import type { WorkshopState } from './state.js';

function testState(): WorkshopState {
	return structuredClone(workshopLayouts[0]?.initialState as WorkshopState);
}

describe('workshopSenses', () => {
	it('declares sight and smell', () => {
		expect(workshopSenses.map((sense) => sense.id)).toEqual([SENSE_SIGHT, SENSE_SMELL]);
	});
});

describe('observeWorkshop', () => {
	it('reports nothing when no channel is enabled', () => {
		const observation = observeWorkshop(testState(), []);
		expect(observation.channels).toEqual([]);
		expect(observation.text).toContain('no working senses');
	});

	it('describes the paint pot underfoot and the wall to the north', () => {
		const observation = observeWorkshop(testState(), [SENSE_SIGHT]); // bot at (0,4)
		expect(observation.text).toContain('floorboards');
		expect(observation.summary).toBeDefined();
	});

	it('names furniture and a painted item in the square described', () => {
		const state = testState();
		state.bot.position = { x: 0, y: 0 }; // right on the paint pot
		const observation = observeWorkshop(state, [SENSE_SIGHT]);
		expect(observation.text).toContain('paint pot');
	});

	it('smells nothing while the birdhouse is unpainted', () => {
		const state = testState();
		state.bot.position = { x: 4, y: 4 }; // beside the birdhouse
		const observation = observeWorkshop(state, [SENSE_SMELL]);
		expect(observation.text).toContain("don't smell anything");
		expect(observation.data?.[SENSE_SMELL]).toEqual({ wetPaintNearby: false });
	});

	it('smells wet paint once something nearby is painted', () => {
		const state = testState();
		state.bot.position = { x: 4, y: 4 };
		const birdhouse = state.items.find((item) => item.id === 'birdhouse');
		if (!birdhouse) throw new Error('fixture missing birdhouse');
		birdhouse.painted = { color: 'blue' };
		const observation = observeWorkshop(state, [SENSE_SMELL]);
		expect(observation.text).toContain('wet paint');
		expect(observation.data?.[SENSE_SMELL]).toEqual({ wetPaintNearby: true });
	});

	it('does not smell paint that is out of reach', () => {
		const state = testState(); // bot at (0,4), birdhouse at (5,4)
		const birdhouse = state.items.find((item) => item.id === 'birdhouse');
		if (!birdhouse) throw new Error('fixture missing birdhouse');
		birdhouse.painted = { color: 'blue' };
		const observation = observeWorkshop(state, [SENSE_SMELL]);
		expect(observation.data?.[SENSE_SMELL]).toEqual({ wetPaintNearby: false });
	});

	it('reports the wall at the room’s edge', () => {
		const state = testState();
		state.bot.position = { x: 5, y: 0 }; // north-east corner
		const observation = observeWorkshop(state, [SENSE_SIGHT]);
		expect(observation.text).toContain('the wall');
	});
});
