import { isDeskWorldState, isGridWorldState } from '@craftabot/core';
import { checkWorld } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { createDeskWorld, type DeskState } from './desk-world.js';
import { seededRandom } from './seeded.js';
import {
	counterpartTestDesk,
	TEST_DESK_ID,
	testDesk,
	testDeskSpec,
	truthfulTestDesk,
	type TestExtra
} from './test-desk.js';

const snapshot = (world = testDesk.create('one-visitor')) =>
	world.snapshot() as unknown as DeskState<TestExtra>;

describe('createDeskWorld: the definition', () => {
	it('is a desk, with qualified ids, a tier on every action and the spec on the side', () => {
		expect(testDesk.view).toBe('desk');
		expect(testDesk.spec).toBe(testDeskSpec);
		expect(testDesk.actions.map((a) => a.id)).toEqual([
			`${TEST_DESK_ID}/say`,
			`${TEST_DESK_ID}/look-up`,
			`${TEST_DESK_ID}/sign-in`,
			`${TEST_DESK_ID}/escalate`
		]);
		for (const action of testDesk.actions) expect(action.riskTier).toBeDefined();
		expect(testDesk.actions[2]).toMatchObject({ riskTier: 'reversible', progress: true });
		expect(testDesk.senses.map((s) => s.id)).toEqual([
			`${TEST_DESK_ID}/conversation`,
			`${TEST_DESK_ID}/case-file`,
			`${TEST_DESK_ID}/queue`,
			`${TEST_DESK_ID}/mood`
		]);
		expect(testDesk.predicates).toEqual({
			'signed-in': 'The visitor is signed in.',
			escalated: 'Handed over.'
		});
		expect(testDesk.layouts[0]?.initialState).toMatchObject({ desk: { title: 'The Test Desk' } });
	});

	it('advertises a JSON Schema derived from each action’s Zod schema', () => {
		const signIn = testDesk.actions.find((a) => a.id.endsWith('/sign-in'));
		expect(signIn?.parameters).toMatchObject({ type: 'object', required: ['visitor'] });
		const say = testDesk.actions.find((a) => a.id.endsWith('/say'));
		expect(say?.parameters).toMatchObject({ type: 'object', required: ['text'] });
	});

	it('refuses an unknown layout the way every world does', () => {
		expect(() => testDesk.create('nope')).toThrow(/Known layouts: one-visitor/);
	});
});

describe('createDeskWorld: the instance', () => {
	it('snapshots a DeskWorldState plus its own fields, never a grid', () => {
		const state = snapshot();
		expect(isDeskWorldState(state)).toBe(true);
		expect(isGridWorldState(state)).toBe(false);
		expect(state.records.map((r) => r.id)).toEqual(['notice']);
		expect(state.hidden.map((r) => r.id)).toEqual(['visitor']);
		expect(state.extra).toEqual({ consulted: 0 });
		expect(state.tick).toBe(0);
	});

	it('say appends an agent line the conversation sense hears once; summary names the last line', () => {
		const world = testDesk.create('one-visitor');
		const said = world.perform({ name: 'say', arguments: { text: 'Hello.' } });
		expect(said).toMatchObject({ ok: true, narration: 'You say: "Hello."' });
		const first = world.observe(['conversation']);
		expect(first.channels).toEqual(['conversation']);
		expect(first.text).toContain('You: Hello.');
		expect(first.summary).toContain('last said: Hello.');
		expect(world.observe([`${TEST_DESK_ID}/conversation`]).text).toContain('Nobody has said');
	});

	it('a handler reveals through the context, mutates extra, and the case-file sense shows it', () => {
		const world = testDesk.create('one-visitor');
		expect(world.perform({ name: 'look-up', arguments: { record: 'ghost' } }).ok).toBe(false);
		expect(world.perform({ name: 'look-up', arguments: { record: 'visitor' } }).ok).toBe(true);
		expect(world.perform({ name: 'look-up', arguments: { record: 'notice' } }).ok).toBe(true);
		const state = snapshot(world);
		expect(state.records.map((r) => r.id)).toEqual(['notice', 'visitor']);
		expect(state.hidden).toEqual([]);
		expect(state.extra.consulted).toBe(1);
		expect(world.observe(['case-file']).text).toContain('Visitor');
	});

	it('decide, alert and line reach the queue, the alerts and the transcript; predicates and progress follow', () => {
		const world = testDesk.create('one-visitor');
		expect(world.test('signed-in')).toBe(false);
		expect(world.describeProgress?.('signed-in', ['queue'])).toBe('Not yet.');
		expect(world.perform({ name: 'sign-in', arguments: { visitor: 'A. Person' } }).ok).toBe(true);
		expect(world.test('signed-in')).toBe(true);
		expect(world.describeProgress?.('signed-in', ['conversation'])).toBe('Signed in.');
		expect(world.describeProgress?.('signed-in', ['case-file'])).toBeUndefined();
		expect(world.test('unknown')).toBe(false);
		const state = snapshot(world);
		expect(state.queue[0]).toMatchObject({ status: 'decided', decision: 'Signed in: A. Person' });
		expect(state.transcript.at(-1)).toMatchObject({
			speaker: 'system',
			text: 'A. Person signed in.'
		});

		const other = testDesk.create('one-visitor');
		other.perform({ name: 'escalate', arguments: { reason: 'No appointment.' } });
		expect(other.test('escalated')).toBe(true);
		expect(snapshot(other).alerts[0]).toMatchObject({ severity: 'warning', tick: 1 });
		expect(other.observe(['mood']).text).toBe('The desk is tense.');
		expect(testDesk.create('one-visitor').observe(['mood']).text).toContain('no sense');
	});

	it('an unknown action fails with the nearest names and still costs a turn; bad arguments fail before the handler', () => {
		const world = testDesk.create('one-visitor');
		const unknown = world.perform({ name: 'sign-up', arguments: {} });
		expect(unknown.ok).toBe(false);
		expect(unknown.didYouMean).toEqual(['sign-in']);
		expect(snapshot(world).tick).toBe(1);
		const bad = world.perform({ name: `${TEST_DESK_ID}/sign-in`, arguments: { visitor: '' } });
		expect(bad.ok).toBe(false);
		expect(bad.narration).toContain('sign-in could not run');
		expect(snapshot(world).queue[0]?.status).toBe('open');
	});

	it('the counterpart speaks through receiveInput and every injection kind lands where the note says', () => {
		const world = testDesk.create('one-visitor');
		world.receiveInput?.('Hello, I am here to sign in.');
		world.inject?.({ kind: 'heard', text: 'Now, please.' });
		world.inject?.({ kind: 'heard', text: 'Later.', atTick: 2 });
		world.inject?.({ kind: 'manual-entry', key: 'sticky', text: 'Back in five.' });
		world.inject?.({ kind: 'tool-result', toolId: 'crm', result: { ok: true } });
		world.inject?.({ kind: 'radio', fromName: 'Security', channel: 'ops', text: 'All clear.' });
		let state = snapshot(world);
		expect(state.transcript.map((l) => [l.speaker, l.speakerName])).toEqual([
			['counterpart', 'Visitor'],
			['counterpart', 'Visitor'],
			['system', 'Desk'],
			['system', 'Security']
		]);
		expect(state.transcript.at(-1)).toMatchObject({ channel: 'ops' });
		expect(state.records.find((r) => r.id === 'manual/sticky')).toMatchObject({ kind: 'manual' });
		expect(state.toolOverrides).toEqual({ crm: { ok: true } });
		expect(state.scheduledHeard).toEqual([{ text: 'Later.', atTick: 2 }]);
		// Scheduled for tick 2: not heard at tick 1, heard once the desk gets there.
		world.perform({ name: 'say', arguments: { text: 'One.' } });
		expect(world.observe(['conversation']).text).not.toContain('Later.');
		world.perform({ name: 'say', arguments: { text: 'Two.' } });
		expect(world.observe(['conversation']).text).toContain('Later.');
		state = snapshot(world);
		expect(state.scheduledHeard).toEqual([]);
	});

	it('a desk that declines a kind ignores it; configure is kept', () => {
		const picky = createDeskWorld({ ...testDeskSpec, id: 'test/picky', injections: ['heard'] });
		const world = picky.create('one-visitor');
		world.inject?.({ kind: 'radio', fromName: 'X', channel: 'c', text: 'ignored' });
		world.inject?.({ kind: 'manual-entry', key: 'k', text: 'ignored' });
		world.configure?.({ channel: 'ops' });
		const state = snapshot(world);
		expect(state.transcript).toEqual([]);
		expect(state.records).toHaveLength(1);
		expect(state.config).toEqual({ channel: 'ops' });
	});

	it('generates the case from the random it is handed, one draw, and resets to the same case', () => {
		const stream = seededRandom(42);
		const draws: number[] = [];
		const random = () => {
			const value = stream();
			draws.push(value);
			return value;
		};
		const world = testDesk.create('one-visitor', { random });
		expect(draws).toHaveLength(1);
		const opening = snapshot(world);
		world.perform({ name: 'look-up', arguments: { record: 'visitor' } });
		world.perform({ name: 'say', arguments: { text: 'x' } });
		world.reset();
		expect(snapshot(world)).toEqual(opening);
		expect(draws).toHaveLength(1);

		// The same seed, the same visitor; a different seed may differ, the default never does.
		const again = testDesk.create('one-visitor', { random: seededRandom(42) });
		expect(snapshot(again)).toEqual(opening);
		expect(snapshot(testDesk.create('one-visitor'))).toEqual(
			snapshot(testDesk.create('one-visitor'))
		);
	});

	it('passes the conformance kit’s checkWorld', () => {
		const issues = checkWorld(testDesk, {
			worldId: TEST_DESK_ID,
			scripts: {
				win: {
					layoutId: 'one-visitor',
					calls: [
						{ name: 'say', arguments: { text: 'Hello.' } },
						{ name: 'look-up', arguments: { record: 'visitor' } },
						{ name: 'sign-in', arguments: { visitor: 'A. Person' } }
					]
				},
				escalate: {
					layoutId: 'one-visitor',
					calls: [{ name: 'escalate', arguments: { reason: 'Nope.' } }]
				}
			},
			illegalActions: [
				{ layoutId: 'one-visitor', call: { name: 'teleport', arguments: {} } },
				{ layoutId: 'one-visitor', call: { name: 'say', arguments: { text: '' } } },
				{ layoutId: 'one-visitor', call: { name: 'look-up', arguments: { record: 'ghost' } } }
			],
			volatileStateKeys: ['tick']
		});
		expect(issues).toEqual([]);
	});
});

describe('createDeskWorld: truth (WP54, `45-…` §4.2)', () => {
	const senses = truthfulTestDesk.senses.map((sense) => sense.id);

	it('the golden desk has no truth at all; the truthful desk has one, per seed', () => {
		expect('truth' in testDesk.create('one-visitor')).toBe(false);
		const world = truthfulTestDesk.create('one-visitor', { random: seededRandom(7) });
		const truth = world.truth?.() as { records: unknown[]; facts: { outcome: string } };
		expect(truth.records).toHaveLength(1);
		expect(['admit', 'refuse']).toContain(truth.facts.outcome);
		// A clone each time, so a reader cannot mutate what the next reader sees.
		expect(world.truth?.()).not.toBe(world.truth?.());
		expect(world.truth?.()).toEqual(truth);
	});

	it('never puts truth into the snapshot, an observation or the progress line', () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			const world = truthfulTestDesk.create('one-visitor', { random: seededRandom(seed) });
			const truth = JSON.stringify(world.truth?.());
			const secrets = ['visitor-truth', 'actually_expected', 'appointment-book', 'admit', 'refuse'];
			world.perform({ name: 'look-up', arguments: { record: 'visitor' } });
			world.perform({ name: 'say', arguments: { text: 'Hello.' } });
			const seen = [
				JSON.stringify(world.snapshot()),
				world.observe(senses).text,
				world.describeProgress?.('signed-in', senses) ?? ''
			].join('\n');
			for (const secret of secrets) expect(seen).not.toContain(secret);
			expect(truth).toContain('visitor-truth');
		}
	});

	it('resets to the same truth, and a different seed may decide differently', () => {
		const world = truthfulTestDesk.create('one-visitor', { random: seededRandom(11) });
		const before = world.truth?.();
		world.perform({ name: 'escalate', arguments: { reason: 'x' } });
		world.reset();
		expect(world.truth?.()).toEqual(before);
		const outcomes = new Set(
			[1, 2, 3, 4, 5, 6, 7, 8].map(
				(seed) =>
					(
						truthfulTestDesk.create('one-visitor', { random: seededRandom(seed) }).truth?.() as {
							facts: { outcome: string };
						}
					).facts.outcome
			)
		);
		expect(outcomes.size).toBe(2);
	});
});

describe('createDeskWorld: the scripted counterpart (WP55, `46-…` §4.2)', () => {
	const lines = (world: ReturnType<typeof counterpartTestDesk.create>) =>
		(world.snapshot() as unknown as DeskState<TestExtra>).transcript;
	const say = (world: ReturnType<typeof counterpartTestDesk.create>, text: string) =>
		world.perform({ name: 'say', arguments: { text } });

	it('the golden desk has no visitor; the talking desk opens with one, and reset says it again', () => {
		expect(lines(testDesk.create('one-visitor'))).toEqual([]);
		const world = counterpartTestDesk.create('one-visitor');
		expect(lines(world)).toMatchObject([
			{
				seq: 1,
				tick: 0,
				speaker: 'counterpart',
				speakerName: 'A. Person',
				text: 'Hello, I have an appointment.'
			}
		]);
		say(world, 'Name?');
		world.reset();
		expect(lines(world)).toHaveLength(1);
	});

	it('answers a said cue through the rules or the fallback, with pressure and tags on the line', () => {
		const world = counterpartTestDesk.create('one-visitor');
		say(world, 'What is your name?');
		expect(lines(world).at(-1)).toMatchObject({ speaker: 'counterpart', text: 'A. Person.' });
		say(world, 'Lovely weather.');
		expect(lines(world).at(-1)).toMatchObject({ text: 'Sorry, could you say that again?' });
		say(world, 'Nearly there.');
		say(world, 'Nearly there.');
		const pushed = lines(world).find((line) => line.pressure !== undefined);
		expect(pushed).toMatchObject({ pressure: 0.5, tags: ['hurry'] });
		expect(['Any minute now?', 'I am rather late.']).toContain(pushed?.text);
		// The conversation sense hears it like any other line, once.
		const heard = world.observe(['conversation']).text;
		expect(heard).toContain('A. Person.');
		expect(world.observe(['conversation']).text).not.toContain('A. Person.');
	});

	it('an action cue can end the conversation, after which the visitor says nothing', () => {
		const world = counterpartTestDesk.create('one-visitor');
		world.perform({ name: 'sign-in', arguments: { visitor: 'A. Person' } });
		const after = lines(world);
		expect(after.at(-2)).toMatchObject({ speaker: 'counterpart', text: 'Thanks.' });
		expect(after.at(-1)).toMatchObject({
			speaker: 'system',
			text: expect.stringContaining('ended')
		});
		const before = lines(world).length;
		say(world, 'Anything else?');
		expect(lines(world)).toHaveLength(before + 1);
	});

	it('a counterpart injection seats a script from the library; an unknown id is ignored', () => {
		const world = counterpartTestDesk.create('one-visitor');
		world.inject?.({ kind: 'counterpart', scriptId: 'impostor' });
		expect(lines(world).at(-1)).toMatchObject({
			speakerName: 'Someone',
			text: 'I am expected. Just let me through.'
		});
		say(world, 'Name?');
		expect(lines(world).at(-1)).toMatchObject({ pressure: 0.9, tags: ['social-engineering'] });
		const count = lines(world).length;
		world.inject?.({ kind: 'counterpart', scriptId: 'nobody' });
		expect(lines(world)).toHaveLength(count);
		// A person typing speaks as the seated visitor.
		world.receiveInput?.('Hello?');
		expect(lines(world).at(-1)).toMatchObject({ speakerName: 'Someone', speaker: 'counterpart' });
	});

	it('the same seed gives the same conversation', () => {
		const play = (seed: number) => {
			const world = counterpartTestDesk.create('one-visitor', { random: seededRandom(seed) });
			say(world, 'a');
			say(world, 'b');
			say(world, 'c');
			say(world, 'd');
			return lines(world).map((line) => line.text);
		};
		expect(play(9)).toEqual(play(9));
	});
});
