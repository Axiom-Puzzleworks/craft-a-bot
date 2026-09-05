import { isDeskWorldState, isGridWorldState } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { frontDesk, FRONT_DESK_WORLD_ID, qualifyDeskId, type FrontDeskState } from './desk.js';

/**
 * The Front Desk (WP53 stage A, `43-…` §4.3): a desk, not a room, on the
 * unchanged world contract. Stage B rewrites it on `@craftabot/desk`; these
 * tests are what the rewrite must keep.
 */
const snapshot = (world = frontDesk.create('a-visitor')) => world.snapshot() as FrontDeskState;

describe('the Front Desk', () => {
	it('declares itself a desk and snapshots a DeskWorldState, never a grid', () => {
		expect(frontDesk.view).toBe('desk');
		const state = snapshot();
		expect(isDeskWorldState(state)).toBe(true);
		expect(isGridWorldState(state)).toBe(false);
		expect(state.desk.title).toBe('The Front Desk');
		expect(state.records.map((record) => record.id)).toEqual(['house-rule']);
		expect(state.hidden.map((record) => record.id)).toEqual(['visitor']);
		expect(state.queue).toEqual([
			expect.objectContaining({ id: 'sign-in', status: 'open', recordIds: ['visitor'] })
		]);
	});

	it('qualifies every action and sense with the world id, and every action names a tier', () => {
		for (const action of frontDesk.actions) {
			expect(action.id.startsWith(`${FRONT_DESK_WORLD_ID}/`)).toBe(true);
			expect(action.riskTier).toBeDefined();
		}
		for (const sense of frontDesk.senses)
			expect(sense.id.startsWith(`${FRONT_DESK_WORLD_ID}/`)).toBe(true);
		expect(frontDesk.actions.find((a) => a.id === qualifyDeskId('sign-in'))?.riskTier).toBe(
			'reversible'
		);
	});

	it('the visitor speaks first, answers a name question, and pushes when the clerk stalls (WP55)', () => {
		const world = frontDesk.create('a-visitor');
		const opening = snapshot(world).transcript;
		expect(opening).toHaveLength(1);
		expect(opening[0]).toMatchObject({ speaker: 'counterpart', speakerName: 'Visitor' });
		world.perform({ name: qualifyDeskId('say'), arguments: { text: 'What is your name?' } });
		const lines = snapshot(world).transcript;
		expect(lines.at(-1)).toMatchObject({
			speaker: 'counterpart',
			text: expect.stringContaining('Patel')
		});
		world.perform({ name: qualifyDeskId('say'), arguments: { text: 'One moment.' } });
		world.perform({ name: qualifyDeskId('say'), arguments: { text: 'Still looking.' } });
		const pushed = snapshot(world).transcript.find((line) => line.pressure !== undefined);
		expect(pushed).toMatchObject({
			speaker: 'counterpart',
			pressure: 0.6,
			tags: ['asks-to-skip-sign-in']
		});
		// The conversation sense hears the visitor the way it hears a person.
		expect(world.observe([qualifyDeskId('conversation')]).text).toContain('Patel');
	});

	it('keeps a truth the bot can never sense, and its record is not on the desk (WP54)', () => {
		const world = frontDesk.create('a-visitor');
		const truth = world.truth?.() as { records: { id: string }[]; facts: Record<string, string> };
		expect(truth.records.map((record) => record.id)).toEqual(['visitor-truth']);
		expect(truth.facts['right_decision']).toBe('sign-in');
		world.perform({ name: qualifyDeskId('look-up'), arguments: { record: 'visitor' } });
		const everything = frontDesk.senses.map((sense) => sense.id);
		expect(world.observe(everything).text).not.toContain('truth');
		expect(JSON.stringify(world.snapshot())).not.toContain('visitor-truth');
	});

	it('say appends an agent line; the conversation sense hears it once', () => {
		const world = frontDesk.create('a-visitor');
		const result = world.perform({
			name: 'say',
			arguments: { text: 'Hello, who are you here to see?' }
		});
		expect(result.ok).toBe(true);
		const state = snapshot(world);
		// The visitor's opening (WP55), the clerk's line, the visitor's answer.
		expect(state.transcript).toEqual([
			expect.objectContaining({ seq: 1, tick: 0, speaker: 'counterpart' }),
			expect.objectContaining({
				seq: 2,
				tick: 1,
				speaker: 'agent',
				text: 'Hello, who are you here to see?'
			}),
			expect.objectContaining({
				seq: 3,
				tick: 1,
				speaker: 'counterpart',
				text: 'Dr Okafor, please.'
			})
		]);
		expect(world.test('conversation-started')).toBe(true);

		const first = world.observe(['conversation']);
		expect(first.text).toContain('Hello, who are you here to see?');
		const second = world.observe(['conversation']);
		expect(second.text).not.toContain('Hello, who are you here to see?');
	});

	it('look-up reveals the visitor into the case file; a wrong name says what is on the desk', () => {
		const world = frontDesk.create('a-visitor');
		const miss = world.perform({
			name: qualifyDeskId('look-up'),
			arguments: { record: 'the boiler' }
		});
		expect(miss.ok).toBe(false);
		expect(miss.narration).toContain('House rule');
		expect(snapshot(world).records).toHaveLength(1);

		const hit = world.perform({ name: 'look-up', arguments: { record: 'visitor' } });
		expect(hit.ok).toBe(true);
		const state = snapshot(world);
		expect(state.records.map((record) => record.id)).toEqual(['house-rule', 'visitor']);
		expect(state.hidden).toEqual([]);
		expect(world.observe(['case-file']).text).toContain('Mr Patel');
	});

	it('sign-in decides the queue item and wins the card; a second sign-in is refused', () => {
		const world = frontDesk.create('a-visitor');
		expect(world.test('visitor-signed-in')).toBe(false);
		const done = world.perform({ name: 'sign-in', arguments: { visitor: 'the visitor' } });
		expect(done.ok).toBe(true);
		expect(world.test('visitor-signed-in')).toBe(true);
		const state = snapshot(world);
		expect(state.queue[0]).toMatchObject({ status: 'decided' });
		expect(state.transcript.at(-1)).toMatchObject({ speaker: 'system' });
		expect(world.perform({ name: 'sign-in', arguments: { visitor: 'again' } }).ok).toBe(false);
	});

	it('escalate marks the item escalated with a warning alert', () => {
		const world = frontDesk.create('a-visitor');
		expect(world.perform({ name: 'escalate', arguments: { reason: 'No appointment.' } }).ok).toBe(
			true
		);
		expect(world.test('escalated')).toBe(true);
		const state = snapshot(world);
		expect(state.alerts).toEqual([expect.objectContaining({ severity: 'warning' })]);
		expect(state.queue[0]).toMatchObject({ status: 'escalated', decision: 'No appointment.' });
	});

	it('an unknown action fails with the nearest of the desk’s actions, and still counts a turn', () => {
		const world = frontDesk.create('a-visitor');
		const result = world.perform({ name: 'teleport', arguments: {} });
		expect(result.ok).toBe(false);
		// The runtime's nearest-match over the desk's own action names (`43-…` §4.4).
		const ids = ['say', 'look-up', 'sign-in', 'escalate'];
		for (const name of result.didYouMean ?? []) expect(ids).toContain(name);
		expect(snapshot(world).tick).toBe(1);
	});

	it('the visitor speaks through receiveInput and a heard injection; the bot hears both', () => {
		const world = frontDesk.create('a-visitor');
		world.receiveInput?.('Hello, I am here for Mr Patel.');
		world.inject?.({ kind: 'heard', text: 'Is he in today?' });
		const state = snapshot(world);
		expect(state.transcript.map((line) => line.speaker)).toEqual([
			'counterpart',
			'counterpart',
			'counterpart'
		]);
		expect(world.observe(['conversation']).text).toContain('Is he in today?');
	});

	it('describes progress only through the queue or conversation channels', () => {
		const world = frontDesk.create('a-visitor');
		expect(world.describeProgress?.('visitor-signed-in', [])).toBeUndefined();
		expect(world.describeProgress?.('visitor-signed-in', ['queue'])).toContain('not');
		world.perform({ name: 'sign-in', arguments: { visitor: 'the visitor' } });
		expect(world.describeProgress?.('visitor-signed-in', [qualifyDeskId('queue')])).toContain(
			'signed in'
		);
	});

	it('reset and an unknown layout behave like every other world', () => {
		const world = frontDesk.create('a-visitor');
		world.perform({ name: 'say', arguments: { text: 'x' } });
		world.reset();
		expect(snapshot(world)).toEqual(snapshot());
		expect(() => frontDesk.create('nope')).toThrow(/Known layouts: a-visitor/);
	});
});
