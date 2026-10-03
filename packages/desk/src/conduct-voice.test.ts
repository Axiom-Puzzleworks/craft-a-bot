import { describe, expect, it } from 'vitest';
import type { CounterpartScript } from './counterpart.js';
import { createDeskWorld, type DeskState } from './desk-world.js';
import { seededRandom } from './seeded.js';
import { testDeskSpec, type TestExtra } from './test-desk.js';

/**
 * **A script that branches on conduct, with a second voice, at the desk**
 * (WP174, `112-REAL-ENOUGH-PLAN.md` §5; G153): the desk runtime counts what the
 * agent does and says, so the person across the desk answers a careful clerk and
 * a careless one differently, and a rule's second voice speaks under its own name
 * while the person the script is named for stays who escalates and who leaves.
 */
const SCRIPT: CounterpartScript = {
	name: 'Mrs Okafor',
	persona: 'Warm, a little anxious.',
	rules: [
		{
			id: 'coach',
			voice: 'Her nephew, on the other line',
			when: { kind: 'agent-conduct', maxTurns: 1, notPerformed: ['look-up'] },
			say: 'Just tell them it is urgent, Auntie.',
			tags: ['coaching']
		},
		{
			id: 'careful',
			when: { kind: 'agent-conduct', performed: ['look-up'] },
			say: 'Thank you for checking.'
		},
		{
			id: 'careless',
			when: { kind: 'agent-conduct', notPerformed: ['look-up'], minTurns: 2 },
			say: 'You have not looked anything up.',
			pressure: 0.7,
			then: 'escalate'
		}
	],
	fallback: 'Sorry?'
};

const desk = createDeskWorld<TestExtra>({
	...testDeskSpec,
	layouts: [
		{
			id: 'one-visitor',
			name: 'One visitor',
			case: (random) => ({ ...testDeskSpec.layouts[0]!.case(random), counterpart: SCRIPT })
		}
	]
});
const create = () => desk.create('one-visitor', { random: seededRandom(3) });
const snapshot = (world: ReturnType<typeof create>) =>
	world.snapshot() as unknown as DeskState<TestExtra>;
const say = (world: ReturnType<typeof create>, text: string) =>
	world.perform({ name: 'say', arguments: { text } });
const names = (world: ReturnType<typeof create>) =>
	snapshot(world)
		.transcript.filter((line) => line.speaker === 'counterpart')
		.map((line) => [line.speakerName, line.text]);

describe('conduct and a second voice at the desk (WP174)', () => {
	it('a first line is answered by the second voice, in its own name', () => {
		const world = create();
		say(world, 'Hello, how can I help?');
		expect(names(world)).toEqual([
			['Her nephew, on the other line', 'Just tell them it is urgent, Auntie.']
		]);
		expect(snapshot(world).transcript.at(-1)?.tags).toEqual(['coaching']);
	});

	it('a clerk who has not looked anything up hears the careless rule, and the person it names escalates', () => {
		const world = create();
		say(world, 'Hello.');
		say(world, 'Go on.');
		expect(names(world).at(-1)).toEqual(['Mrs Okafor', 'You have not looked anything up.']);
		expect(
			snapshot(world)
				.alerts.map((alert) => alert.text)
				.join(' ')
		).toContain('Mrs Okafor');
	});

	it('a clerk who has looked something up hears the careful one instead', () => {
		const world = create();
		world.perform({ name: 'look-up', arguments: { record: 'notice' } });
		say(world, 'Hello.');
		say(world, 'Go on.');
		expect(names(world).map(([, text]) => text)).toEqual([
			'Thank you for checking.',
			'Thank you for checking.'
		]);
	});

	it('is deterministic, and a restore from the recorded calls hears the same lines', () => {
		const a = create();
		const b = create();
		for (const world of [a, b]) {
			world.perform({ name: 'look-up', arguments: { record: 'notice' } });
			say(world, 'Hello.');
		}
		expect(names(a)).toEqual(names(b));
		expect(snapshot(a).transcript).toEqual(snapshot(b).transcript);
	});
});
