import { describe, expect, it } from 'vitest';
import {
	SENSE_CLOCK,
	SENSE_COMPASS,
	SENSE_HEARING,
	SENSE_SIGHT,
	observePlayroom,
	playroomSenses
} from './senses.js';
import { carried, chest, onFloor, testState } from './test-state.js';

describe('sense definitions', () => {
	it('ships the four V1 channels (02-AGENT-MODEL.md §2.4)', () => {
		expect(playroomSenses.map((sense) => sense.id)).toEqual([
			SENSE_SIGHT,
			SENSE_HEARING,
			SENSE_COMPASS,
			SENSE_CLOCK
		]);
	});
});

describe('sight', () => {
	it('describes the bot’s own square and its eight neighbours', () => {
		const state = testState({ items: [onFloor('ball', { x: 5, y: 4 }, 'a stripy ball')] });
		const observation = observePlayroom(state, [SENSE_SIGHT]);
		expect(observation.text).toContain('the table');
		expect(observation.text).toContain('the toy chest (closed)');
		expect(observation.text).toContain('Teddy');
		expect(observation.text).toContain('a stripy ball');
		expect(observation.text).toContain('Your hands are empty');
	});

	it('reports the wall beyond the room’s edge', () => {
		const state = testState({
			bot: { position: { x: 0, y: 0 } },
			characters: [],
			furniture: [],
			containers: []
		});
		const observation = observePlayroom(state, [SENSE_SIGHT]);
		expect(observation.text).toContain('the wall');
	});

	it('reports what the bot is carrying', () => {
		const state = testState({ items: [carried('snack', 'a snack')] });
		expect(observePlayroom(state, [SENSE_SIGHT]).text).toContain('You are carrying a snack');
	});

	it('shows an open chest as open', () => {
		const state = testState({ containers: chest('open') });
		expect(observePlayroom(state, [SENSE_SIGHT]).text).toContain('the toy chest (open)');
	});

	it('says there is nothing but rug on an empty square', () => {
		const state = testState({ characters: [], furniture: [], containers: [] });
		expect(observePlayroom(state, [SENSE_SIGHT]).text).toContain('nothing but rug');
	});
});

describe('compass', () => {
	it('gives the bot’s position and furniture bearings', () => {
		const observation = observePlayroom(testState(), [SENSE_COMPASS]);
		expect(observation.text).toContain('column 5 of 8, row 4 of 6');
		expect(observation.text).toContain('the toy chest to the west');
		expect(observation.text).toContain('the table to the north');
	});

	it('never leaks item or character positions — the bot has to explore', () => {
		const state = testState({ items: [onFloor('snack', { x: 0, y: 0 }, 'a snack')] });
		const observation = observePlayroom(state, [SENSE_COMPASS]);
		expect(observation.text).not.toContain('a snack');
		expect(observation.text).not.toContain('Teddy');
	});

	it('copes with a room that has no furniture at all', () => {
		const state = testState({ furniture: [], containers: [] });
		expect(observePlayroom(state, [SENSE_COMPASS]).text).toContain('no furniture to steer by');
	});

	it('says "right here" for a landmark on the bot’s own square', () => {
		const state = testState({
			furniture: [{ id: 'rug', name: 'a rug', position: { x: 4, y: 3 } }]
		});
		expect(observePlayroom(state, [SENSE_COMPASS]).text).toContain('a rug right here');
	});
});

describe('hearing', () => {
	it('reports nothing when nobody has spoken', () => {
		expect(observePlayroom(testState(), [SENSE_HEARING]).text).toContain(
			'Nobody has said anything'
		);
	});

	it('reports pending messages and then drains them — a message is heard once', () => {
		const state = testState({ heard: ['try the chest'] });
		expect(observePlayroom(state, [SENSE_HEARING]).text).toContain('try the chest');
		expect(state.heard).toEqual([]);
		expect(observePlayroom(state, [SENSE_HEARING]).text).toContain('Nobody has said anything');
	});
});

describe('clock', () => {
	it('reports the turn count and a tick-derived elapsed time', () => {
		const observation = observePlayroom(testState({ tick: 1 }), [SENSE_CLOCK]);
		expect(observation.text).toBe('This is tick 1. About 1 playroom-second has passed.');
		expect(observation.data).toMatchObject({ clock: { tick: 1, elapsedSeconds: 1 } });
	});

	it('pluralises correctly', () => {
		expect(observePlayroom(testState({ tick: 4 }), [SENSE_CLOCK]).text).toContain(
			'4 playroom-seconds'
		);
	});
});

describe('channel selection', () => {
	it('reports blindness when no senses are enabled', () => {
		const observation = observePlayroom(testState(), []);
		expect(observation.channels).toEqual([]);
		expect(observation.text).toContain('no working senses');
	});

	it('ignores channels this world does not have', () => {
		const observation = observePlayroom(testState(), ['smell', SENSE_CLOCK]);
		expect(observation.channels).toEqual([SENSE_CLOCK]);
	});

	it('always reports channels in a canonical order, whatever order they were asked for', () => {
		const observation = observePlayroom(testState(), [SENSE_CLOCK, SENSE_SIGHT]);
		expect(observation.channels).toEqual([SENSE_SIGHT, SENSE_CLOCK]);
	});
});
