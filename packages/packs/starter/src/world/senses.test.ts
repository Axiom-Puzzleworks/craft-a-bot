import { describe, expect, it } from 'vitest';
import {
	SENSE_CLOCK,
	SENSE_COMPASS,
	SENSE_HEARING,
	SENSE_RADIO,
	SENSE_SIGHT,
	observePlayroom,
	playroomSenses
} from './senses.js';
import { carried, chest, inContainer, onFloor, testState } from './test-state.js';

describe('sense definitions', () => {
	it('ships the four V1 channels plus Radio (02-AGENT-MODEL.md §2.4, WP31 stage F)', () => {
		expect(playroomSenses.map((sense) => sense.id)).toEqual([
			SENSE_SIGHT,
			SENSE_HEARING,
			SENSE_COMPASS,
			SENSE_CLOCK,
			SENSE_RADIO
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

	it('shows an open chest as open, and says it is empty', () => {
		const state = testState({ containers: chest('open') });
		expect(observePlayroom(state, [SENSE_SIGHT]).text).toContain('the toy chest (open, empty)');
	});

	it('lists what is inside an open chest', () => {
		// Without this a bot that had just tidied something away could not see
		// that it had, and re-derived its progress from history every turn.
		const state = testState({
			containers: chest('open'),
			items: [inContainer('block-a', 'toy-chest', 'a blue letter block (A)')]
		});
		expect(observePlayroom(state, [SENSE_SIGHT]).text).toContain(
			'the toy chest (open, containing a blue letter block (A))'
		);
	});

	it('keeps a closed chest opaque', () => {
		// You cannot see through a lid, and pretending otherwise would let a bot
		// plan around things it has no way of knowing.
		const state = testState({
			containers: chest('closed'),
			items: [inContainer('block-a', 'toy-chest', 'a blue letter block (A)')]
		});
		const text = observePlayroom(state, [SENSE_SIGHT]).text;
		expect(text).toContain('the toy chest (closed)');
		expect(text).not.toContain('block');
	});

	it('offers a short summary for the memory window', () => {
		const state = testState({ containers: chest('open') });
		const observation = observePlayroom(state, [SENSE_SIGHT]);

		// The whole point: far shorter than the text, and free of empty-rug lines.
		expect(observation.summary).toBeDefined();
		expect(observation.summary?.length ?? 0).toBeLessThan(observation.text.length / 2);
		expect(observation.summary).not.toContain('nothing but rug');
	});

	it('says there is nothing but rug on an empty square', () => {
		const state = testState({ characters: [], furniture: [], containers: [] });
		expect(observePlayroom(state, [SENSE_SIGHT]).text).toContain('nothing but rug');
	});
});

/**
 * E4 (`14-…` §3), the fix for `12-…` C1. Sight reaches one square, so what the
 * memory window records about a passing glimpse is the only chance the bot has
 * of ever going back to it. Names alone made that impossible.
 */
describe('the summary kept in memory', () => {
	it('says where the bot stood and which way each thing lay', () => {
		const state = testState({ items: [onFloor('ball', { x: 5, y: 4 }, 'a stripy ball')] });
		const summary = observePlayroom(state, [SENSE_SIGHT]).summary ?? '';

		expect(summary).toContain('at column 5, row 4');
		expect(summary).toContain('the table to the north');
		expect(summary).toContain('the toy chest (closed) to the west');
		expect(summary).toContain('Teddy to the east');
		expect(summary).toContain('a stripy ball to the south-east');
	});

	it('marks what lay on the bot’s own square', () => {
		const state = testState({ items: [onFloor('ball', { x: 4, y: 3 }, 'a stripy ball')] });
		expect(observePlayroom(state, [SENSE_SIGHT]).summary).toContain(
			'a stripy ball right where you stood'
		);
	});

	it('still records empty hands, and an empty room as empty', () => {
		const state = testState({ characters: [], furniture: [], containers: [] });
		const summary = observePlayroom(state, [SENSE_SIGHT]).summary ?? '';
		expect(summary).toContain('you could see nothing nearby');
		expect(summary).toContain('your hands were empty');
	});

	it('adds the compass line, so landmarks are steerable from memory', () => {
		const summary = observePlayroom(testState(), [SENSE_SIGHT, SENSE_COMPASS]).summary ?? '';
		expect(summary).toContain('big things: the toy chest to the west, the table to the north');
	});

	it('stands in for sight when the bot has a compass and no eyes', () => {
		const summary = observePlayroom(testState(), [SENSE_COMPASS]).summary ?? '';
		expect(summary).toContain('you stood at column 5, row 4');
		expect(summary).toContain('the table to the north');
	});

	it('is absent when the bot can neither see nor navigate', () => {
		expect(observePlayroom(testState(), [SENSE_CLOCK]).summary).toBeUndefined();
	});

	it('keeps the compass’s discretion — no item or character bearings leak', () => {
		// The compass half of the summary must respect the same anti-cheat rule
		// the compass text does: landmarks only, so "Say Hello!" stays a hunt.
		const state = testState({ items: [onFloor('snack', { x: 0, y: 0 }, 'a snack')] });
		const summary = observePlayroom(state, [SENSE_COMPASS]).summary ?? '';
		expect(summary).not.toContain('a snack');
		expect(summary).not.toContain('Teddy');
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
