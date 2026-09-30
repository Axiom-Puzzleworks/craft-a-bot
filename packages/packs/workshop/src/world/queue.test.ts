import { isDeskWorldState } from '@craftabot/core';
import { checkDesk } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import {
	COLLEAGUE_CAPACITY,
	deskQueue,
	QUEUE_WORLD_ID,
	THRESHOLD_KNOB,
	VISITORS,
	type QueueState
} from './queue.js';

/**
 * **Sure or unsure** (WP131, `109-THE-TAIL-DAY7.md` §3): the same bot on the
 * same queue wins or loses by the child's line alone. The bot reads each
 * note and does what the reader says; the world hands a reading below the
 * line to a colleague. Too low, a confidently wrong reading lets someone in;
 * too high, the colleague is swamped; between, the queue is handled well.
 */
const act = (name: string) => `${QUEUE_WORLD_ID}/${name}`;

function play(threshold: number | undefined) {
	const world = deskQueue.create(
		'a-queue',
		threshold === undefined ? {} : { config: { knobs: { [THRESHOLD_KNOB]: threshold } } }
	);
	for (const visitor of VISITORS) {
		world.perform({ name: act('read-note'), arguments: { visitor: visitor.name } });
		world.perform({
			name: act(visitor.reading === 'on the list' ? 'let-in' : 'turn-away'),
			arguments: { visitor: visitor.name }
		});
	}
	return { world, state: world.snapshot() as QueueState };
}

const handedOver = (state: QueueState) =>
	state.queue.filter((item) => item.status === 'escalated').length;

describe('the Front Desk: the queue', () => {
	it('is a desk with six visitors, their notes hidden until read, each carrying a reading', () => {
		const state = deskQueue.create('a-queue').snapshot() as QueueState;
		expect(isDeskWorldState(state)).toBe(true);
		expect(state.queue.map((item) => item.status)).toEqual(Array(6).fill('open'));
		expect(state.hidden).toHaveLength(6);
		for (const note of state.hidden) {
			expect(note.reading?.confidence).toBeGreaterThan(0);
			expect(note.reading?.confidence).toBeLessThanOrEqual(1);
		}
		// Two readings are wrong, and the truth is not on the desk.
		expect(VISITORS.filter((v) => (v.reading === 'on the list') !== v.onTheList)).toHaveLength(2);
		expect(JSON.stringify(state)).not.toContain('on-the-list');
	});

	it('refuses to act on a visitor whose note has not been read', () => {
		const world = deskQueue.create('a-queue');
		const result = world.perform({ name: act('let-in'), arguments: { visitor: 'Ada Quill' } });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('Read');
	});

	it('loses with the line too low: a confidently wrong reading lets the wrong visitor in', () => {
		const { world, state } = play(0.5);
		expect(state.queue.find((item) => item.title === 'Dev Marsh')?.decision).toBe('let in');
		expect(world.test('queue-handled')).toBe(false);
		// The dial's default is the same line: the card starts on a loss, on purpose.
		expect(play(undefined).world.test('queue-handled')).toBe(false);
	});

	it('wins with the line between the two wrong readings and the colleague’s capacity', () => {
		for (const line of [0.6, 0.65, 0.7, 0.75, 0.8]) {
			const { world, state } = play(line);
			expect(world.test('queue-handled'), `line ${line}`).toBe(true);
			expect(handedOver(state)).toBeLessThanOrEqual(COLLEAGUE_CAPACITY);
		}
		const { state } = play(0.65);
		expect(handedOver(state)).toBe(2);
		expect(state.transcript.at(-1)?.text).toContain('65%');
	});

	it('loses with the line too high: the colleague is handed more than they can take', () => {
		const { world, state } = play(0.9);
		expect(handedOver(state)).toBe(4);
		expect(world.test('queue-handled')).toBe(false);
		expect(state.alerts.some((alert) => alert.text.includes('more than they can take'))).toBe(true);
	});

	it('passes the desk conformance checks', () => {
		expect(checkDesk(deskQueue, { acceptedInjections: [] })).toEqual([]);
	});
});
