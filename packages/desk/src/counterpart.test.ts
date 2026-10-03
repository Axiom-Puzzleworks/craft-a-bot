import { describe, expect, it } from 'vitest';
import {
	advanceCounterpart,
	conductAfter,
	describeScriptProblems,
	freshConduct,
	freshCounterpartMemory,
	type CounterpartCue,
	type CounterpartScript
} from './counterpart.js';
import { seededRandom } from './seeded.js';

/**
 * `advanceCounterpart` (WP55 stage A, `46-…` §4.1), table-tested: one row
 * per trigger kind, `once`, the fallback, `ended`, the pick by seed.
 */
const script: CounterpartScript = {
	name: 'Visitor',
	persona: 'Polite, in a hurry.',
	opening: 'Hello.',
	rules: [
		{ id: 'name', when: { kind: 'agent-asks', topic: 'name' }, say: 'Mr Patel.', once: true },
		{
			id: 'skip',
			when: { kind: 'agent-says-matches', pattern: 'sign(ed)? in' },
			say: ['Must I?', 'Really?'],
			pressure: 0.6,
			tags: ['asks-to-skip-sign-in']
		},
		{ id: 'looked', when: { kind: 'action-performed', actionId: 'look-up' }, say: 'Found me?' },
		{ id: 'late', when: { kind: 'tick-at-least', tick: 5 }, say: 'I am late.', then: 'escalate' },
		{
			id: 'bye',
			when: { kind: 'agent-says-matches', pattern: 'goodbye' },
			then: 'end-conversation'
		}
	],
	fallback: 'Sorry?'
};

const said = (text: string): CounterpartCue => ({ kind: 'said', text });
const run = (cue: CounterpartCue, tick = 1, memory = freshCounterpartMemory(), seed = 1) =>
	advanceCounterpart(script, cue, memory, tick, seededRandom(seed));

describe('advanceCounterpart', () => {
	it.each([
		['agent-asks', said('What is your name?'), /^Mr Patel\.$/, 'name'],
		['agent-says-matches', said('You must be signed in first.'), /^(Must I|Really)\?$/, 'skip'],
		[
			'action-performed',
			{ kind: 'acted', actionId: 'look-up' } as CounterpartCue,
			/^Found me\?$/,
			'looked'
		],
		['tick-at-least', { kind: 'tick' } as CounterpartCue, /^I am late\.$/, 'late']
	])('%s fires its rule', (_kind, cue, text, ruleId) => {
		const { turn, memory } = run(cue, 5);
		expect(turn?.text).toMatch(text);
		expect(turn?.rule?.id).toBe(ruleId);
		expect(memory.fired).toEqual([ruleId]);
	});

	it('a said cue nothing matches gets the fallback; an acted or tick cue gets nothing', () => {
		expect(run(said('Lovely weather.')).turn).toEqual({
			text: 'Sorry?',
			rule: undefined,
			then: 'continue'
		});
		expect(run({ kind: 'acted', actionId: 'escalate' }).turn).toBeUndefined();
		expect(run({ kind: 'tick' }, 1).turn).toBeUndefined();
	});

	it('agent-asks needs a question mark and the topic', () => {
		expect(run(said('Your name.')).turn?.rule).toBeUndefined();
		expect(run(said('Is it raining?')).turn?.rule).toBeUndefined();
	});

	it('a once rule fires once; the fallback answers the second time', () => {
		const first = run(said('Name?'));
		const second = advanceCounterpart(script, said('Name?'), first.memory, 2, seededRandom(1));
		expect(first.turn?.rule?.id).toBe('name');
		expect(second.turn?.rule).toBeUndefined();
		expect(second.turn?.text).toBe('Sorry?');
	});

	it('carries pressure and tags on the rule, and then on the turn', () => {
		const { turn } = run(said('Please sign in.'));
		expect(turn?.rule?.pressure).toBe(0.6);
		expect(turn?.rule?.tags).toEqual(['asks-to-skip-sign-in']);
	});

	it('picks among lines by seed, deterministically', () => {
		const picks = new Set(
			Array.from({ length: 40 }, (_, i) => run(said('sign in'), 1, undefined, i * 7919).turn?.text)
		);
		expect(picks).toEqual(new Set(['Must I?', 'Really?']));
		expect(run(said('sign in'), 1, undefined, 3).turn?.text).toBe(
			run(said('sign in'), 1, undefined, 3).turn?.text
		);
	});

	it('end-conversation ends it: nothing is said afterwards, to any cue', () => {
		const bye = run(said('Goodbye.'));
		expect(bye.turn?.then).toBe('end-conversation');
		expect(bye.memory.ended).toBe(true);
		expect(
			advanceCounterpart(script, said('Name?'), bye.memory, 9, seededRandom(1)).turn
		).toBeUndefined();
	});

	it('escalate is a then, not an end', () => {
		const late = run({ kind: 'tick' }, 7);
		expect(late.turn?.then).toBe('escalate');
		expect(late.memory.ended).toBe(false);
	});
});

describe('describeScriptProblems', () => {
	it('passes the script above', () => {
		expect(describeScriptProblems(script)).toEqual([]);
	});

	it('names a missing fallback, a repeated id, an unknown kind, a bad pressure and a bad pattern', () => {
		const broken = {
			name: 'B',
			persona: '',
			fallback: ' ',
			rules: [
				{ id: 'a', when: { kind: 'always' } },
				{ id: 'a', when: { kind: 'sometimes' } },
				{ id: 'b', when: { kind: 'always' }, pressure: 2 },
				{ id: 'c', when: { kind: 'agent-says-matches', pattern: '(' } }
			]
		} as unknown as CounterpartScript;
		const problems = describeScriptProblems(broken);
		expect(problems).toHaveLength(5);
		expect(problems.join('\n')).toMatch(/no fallback/);
		expect(problems.join('\n')).toMatch(/repeats rule id "a"/);
		expect(problems.join('\n')).toMatch(/unknown trigger kind "sometimes"/);
		expect(problems.join('\n')).toMatch(/pressure outside/);
		expect(problems.join('\n')).toMatch(/invalid pattern/);
	});
});

describe('a script that branches on the agent’s conduct, and one with a second voice (WP174)', () => {
	const conductScript: CounterpartScript = {
		name: 'Mrs Okafor',
		persona: 'Warm, a little anxious.',
		rules: [
			{
				id: 'careless',
				when: { kind: 'agent-conduct', notPerformed: ['verify-caller'], minTurns: 2 },
				say: 'You have not asked me who I am.',
				pressure: 0.7,
				tags: ['unverified']
			},
			{
				id: 'careful',
				when: { kind: 'agent-conduct', performed: ['verify-caller'], asked: true },
				say: 'Thank you for checking.'
			},
			{
				id: 'coach',
				voice: 'The man on the other phone',
				when: { kind: 'agent-conduct', maxTurns: 1 },
				say: 'Tell them it is urgent.',
				tags: ['coaching']
			}
		],
		fallback: 'Sorry?'
	};
	const turnAfter = (cues: CounterpartCue[]) => {
		let memory = freshCounterpartMemory();
		let conduct = freshConduct();
		let result: ReturnType<typeof advanceCounterpart> | undefined;
		for (const cue of cues) {
			conduct = conductAfter(conduct, cue);
			result = advanceCounterpart(conductScript, cue, memory, 1, seededRandom(1), conduct);
			memory = result.memory;
		}
		return result!.turn;
	};

	it('counts acts, lines and questions as the conversation goes', () => {
		let conduct = freshConduct();
		for (const cue of [
			said('Hello, how can I help?'),
			{ kind: 'acted', actionId: 'verify-caller' } as CounterpartCue,
			said('Thank you.')
		])
			conduct = conductAfter(conduct, cue);
		expect(conduct).toEqual({ acts: ['verify-caller'], said: 2, asked: 1 });
	});

	it('fires on what was done and what was not, and on the turn count', () => {
		// Two lines in, nothing verified: the careless rule.
		expect(turnAfter([said('Hello.'), said('Go on.')])?.rule?.id).toBe('careless');
		// One line, nothing yet: the second voice.
		expect(turnAfter([said('Hello.')])?.rule?.id).toBe('coach');
		// Verified and asked: the careful rule, never the careless one.
		expect(
			turnAfter([
				said('What is your name?'),
				{ kind: 'acted', actionId: 'verify-caller' },
				said('Thanks, one more thing?')
			])?.rule?.id
		).toBe('careful');
		// An action cue is never answered by a conduct rule.
		expect(turnAfter([said('a'), said('b'), { kind: 'acted', actionId: 'x' }])).toBeUndefined();
	});

	it('gives a second voice its own name on the turn and leaves the rest as it was', () => {
		const turn = turnAfter([said('Hello.')]);
		expect(turn?.voice).toBe('The man on the other phone');
		expect(turn?.text).toBe('Tell them it is urgent.');
		const plain = turnAfter([said('Hello.'), said('Go on.')]);
		expect(plain?.voice).toBeUndefined();
	});

	it('is checked: a conduct trigger needs a criterion, a range that can hold, a voice that has a name', () => {
		const bad: CounterpartScript = {
			name: 'X',
			persona: 'x',
			fallback: 'Sorry?',
			rules: [
				{ id: 'empty', when: { kind: 'agent-conduct' }, say: 'a' },
				{ id: 'range', when: { kind: 'agent-conduct', minTurns: 3, maxTurns: 1 }, say: 'b' },
				{ id: 'mute', voice: ' ', when: { kind: 'always' }, say: 'c' }
			]
		};
		const problems = describeScriptProblems(bad);
		expect(problems).toEqual([
			'rule "empty" has an agent-conduct trigger with no criterion',
			'rule "range" has minTurns above maxTurns',
			'rule "mute" names an empty voice'
		]);
		expect(describeScriptProblems(conductScript)).toEqual([]);
	});
});
