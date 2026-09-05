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
