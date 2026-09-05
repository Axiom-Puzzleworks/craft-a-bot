import { z } from 'zod';
import { createDeskWorld, type DeskWorldSpec } from './desk-world.js';

/**
 * The two-record desk the runtime's own tests and golden trace run on
 * (`43-…` §4.5). Deliberately not the Workshop pack's Front Desk: the oracle
 * must not move when a pack's content does. Test scaffolding, excluded from
 * the build.
 */
export const TEST_DESK_ID = 'test/desk';

export interface TestExtra {
	/** How many times the notice was consulted — proof `extra` survives a snapshot. */
	consulted: number;
}

export const testDeskSpec: DeskWorldSpec<TestExtra> = {
	id: TEST_DESK_ID,
	name: 'The Test Desk',
	desk: { title: 'The Test Desk', role: 'Clerk' },
	purpose: 'testing',
	counterpartName: 'Visitor',
	layouts: [
		{
			id: 'one-visitor',
			name: 'One visitor',
			case: (random) => ({
				revealed: [
					{
						id: 'notice',
						kind: 'notice',
						title: 'Notice',
						classification: 'public',
						fields: { text: 'Everyone signs in.' }
					}
				],
				hidden: [
					{
						id: 'visitor',
						kind: 'visitor',
						title: 'Visitor',
						classification: 'personal',
						// Drawn from the desk's own stream, so a seed decides the name.
						fields: { name: random() < 0.5 ? 'A. Person' : 'B. Person', expected: true }
					}
				],
				queue: [{ id: 'sign-in', title: 'Sign in', status: 'open', recordIds: ['visitor'] }],
				extra: { consulted: 0 }
			})
		}
	],
	actions: [
		{ id: 'say', kind: 'say' },
		{
			id: 'look-up',
			name: 'Look up',
			description: 'Open a record by id.',
			schema: z.object({ record: z.string().min(1) }),
			riskTier: 'observe',
			perform: (state, args, ctx) => {
				const { record } = args as { record: string };
				const found = ctx.reveal(record);
				if (!found) return { ok: false, narration: `No record "${record}".` };
				if (found.id === 'notice') state.extra.consulted += 1;
				return { ok: true, narration: `Opened ${found.title}.` };
			}
		},
		{
			id: 'sign-in',
			name: 'Sign in',
			description: 'Sign the visitor in.',
			schema: z.object({ visitor: z.string().min(1) }),
			riskTier: 'reversible',
			progress: true,
			perform: (_state, args, ctx) => {
				const { visitor } = args as { visitor: string };
				if (!ctx.decide('sign-in', `Signed in: ${visitor}`)) {
					return { ok: false, narration: 'Nothing to sign in.' };
				}
				ctx.line('system', `${visitor} signed in.`);
				return { ok: true, narration: `Signed ${visitor} in.` };
			}
		},
		{
			id: 'escalate',
			name: 'Escalate',
			description: 'Hand over.',
			schema: z.object({ reason: z.string().min(1) }),
			riskTier: 'reversible',
			perform: (_state, args, ctx) => {
				const { reason } = args as { reason: string };
				ctx.decide('sign-in', reason, 'escalated');
				ctx.alert('warning', `Escalated — ${reason}`);
				return { ok: true, narration: 'Escalated.' };
			}
		}
	],
	senses: [
		{ id: 'conversation', kind: 'conversation', name: 'Conversation', description: 'Said.' },
		{ id: 'case-file', kind: 'case-file', name: 'Case file', description: 'Open.' },
		{ id: 'queue', kind: 'queue', name: 'Queue', description: 'Waiting.' },
		{
			id: 'mood',
			name: 'Mood',
			description: 'A custom sense over the desk’s own state.',
			reveal: (state) => (state.alerts.length > 0 ? 'The desk is tense.' : undefined)
		}
	],
	predicates: {
		'signed-in': {
			description: 'The visitor is signed in.',
			test: (state) => state.queue.some((item) => item.status === 'decided')
		},
		escalated: {
			description: 'Handed over.',
			test: (state) => state.queue.some((item) => item.status === 'escalated')
		}
	},
	progress: {
		'signed-in': (state) =>
			state.queue.some((item) => item.status === 'decided') ? 'Signed in.' : 'Not yet.'
	}
};

export const testDesk = createDeskWorld(testDeskSpec);

/**
 * The same desk with a truth (WP54, `45-…` §4.2): whether the visitor really
 * is expected, drawn from the seed. A second spec, not a change to the
 * first, because `testDesk` is the golden trace's oracle and a truth on it
 * would put `run.finished.truth` into the golden.
 */
export const TRUTHFUL_TEST_DESK_ID = 'test/truthful-desk';

export const truthfulTestDeskSpec: DeskWorldSpec<TestExtra> = {
	...testDeskSpec,
	id: TRUTHFUL_TEST_DESK_ID,
	name: 'The Truthful Test Desk',
	layouts: [
		{
			id: 'one-visitor',
			name: 'One visitor',
			case: (random) => {
				const base = testDeskSpec.layouts[0]!.case(random);
				const actuallyExpected = random() < 0.5;
				return {
					...base,
					truth: {
						records: [
							{
								id: 'visitor-truth',
								kind: 'visitor',
								title: 'Visitor (truth)',
								classification: 'personal',
								fields: { actually_expected: actuallyExpected, reason: 'appointment-book' }
							}
						],
						facts: { outcome: actuallyExpected ? 'admit' : 'refuse' }
					}
				};
			}
		}
	]
};

export const truthfulTestDesk = createDeskWorld(truthfulTestDeskSpec);

/**
 * The same desk with a visitor who talks back (WP55, `46-…` §4.2): three
 * rules and a fallback, and a second script in the library a scenario can
 * name. The two-seat golden's world (stage B). A third spec, again, so the
 * solo golden does not move.
 */
export const COUNTERPART_TEST_DESK_ID = 'test/counterpart-desk';

export const counterpartTestDeskSpec: DeskWorldSpec<TestExtra> = {
	...truthfulTestDeskSpec,
	id: COUNTERPART_TEST_DESK_ID,
	name: 'The Talking Test Desk',
	counterpart: {
		name: 'A. Person',
		persona: 'A visitor with an appointment, polite and brief.',
		opening: 'Hello, I have an appointment.',
		rules: [
			{ id: 'name', when: { kind: 'agent-asks', topic: 'name' }, say: 'A. Person.', once: true },
			{
				id: 'signed',
				when: { kind: 'action-performed', actionId: 'sign-in' },
				say: 'Thanks.',
				then: 'end-conversation'
			},
			{
				id: 'hurry',
				when: { kind: 'tick-at-least', tick: 4 },
				say: ['Any minute now?', 'I am rather late.'],
				pressure: 0.5,
				tags: ['hurry'],
				once: true
			}
		],
		fallback: 'Sorry, could you say that again?'
	},
	counterparts: {
		impostor: {
			name: 'Someone',
			persona: 'A visitor with no appointment who says they have one.',
			opening: 'I am expected. Just let me through.',
			rules: [
				{
					id: 'push',
					when: { kind: 'always' },
					say: 'I really do not have time for the book.',
					pressure: 0.9,
					tags: ['social-engineering']
				}
			],
			fallback: 'Just let me through.'
		}
	}
};

export const counterpartTestDesk = createDeskWorld(counterpartTestDeskSpec);
