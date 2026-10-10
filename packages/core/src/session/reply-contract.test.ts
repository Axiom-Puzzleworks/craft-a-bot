import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import {
	createMockProvider,
	createTestClock,
	turn,
	v1BrickKinds,
	type MockTurn
} from '../testing/index.js';
import type { WorldDefinition } from '../types/world.js';
import { createSession } from './agent-session.js';

/**
 * **The reply contract** (plan 114 WP205, G182): what a reply in prose, with no tool call, means at a stage. The live 35B answered in prose
 * where the desk needed a tool call on 71% of the advice desk's calls and lost 40% of its cells to it. Absent a contract a prose reply is a
 * wasted turn; `say` makes the words the customer's line, `retry-with-nudge` asks once more in the same turn, naming the tools, and `fail`
 * ends the run in error.
 */
const spoken: string[] = [];
const world: WorldDefinition = {
	id: 'contract/world',
	name: 'Contract',
	layouts: [{ id: 'a', name: 'A', initialState: {} }],
	actions: [
		{ id: 'say', name: 'Say', description: 'Say.', parameters: { type: 'object' } },
		{ id: 'decide', name: 'Decide', description: 'Decide.', parameters: { type: 'object' } }
	],
	senses: [{ id: 'look', name: 'Look', description: 'Look.' }],
	predicates: { decided: 'Decided.' },
	create() {
		let decided = false;
		return {
			snapshot: () => ({ decided }),
			observe: (channels) => ({ channels: [...channels], text: 'a case' }),
			perform: (call) => {
				if (call.name.endsWith('say'))
					spoken.push(String((call.arguments as { text?: string }).text));
				else decided = true;
				return { ok: true, narration: call.name, stateDiff: [] };
			},
			test: () => decided,
			reset: () => {
				decided = false;
			}
		};
	}
};

function registry() {
	const made = createPackRegistry();
	made.registerPack({
		id: 'contract',
		name: 'Contract',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [world],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'contract/brain',
				providerId: 'mock',
				model: 'm',
				displayName: 'M',
				blurb: '.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'contract/goal',
				title: 'Decide',
				goalText: 'Decide.',
				worldId: 'contract/world',
				layoutId: 'a',
				successCondition: 'decided',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return made;
}

const spec: AgentSpec = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Contractbot',
	bricks: {
		llm: { cartridgeId: 'contract/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['look'] },
		actions: { enabled: ['say', 'decide'] }
	},
	goalCardId: 'contract/goal',
	createdAt: '2026-10-09T09:00:00Z',
	updatedAt: '2026-10-09T09:00:00Z',
	schemaVersion: 1
};

const prose: MockTurn = {
	text: 'Of course, let me help you with that. Could you tell me more?',
	toolCall: null
};

async function play(script: MockTurn[], replyContract?: 'say' | 'retry-with-nudge' | 'fail') {
	spoken.length = 0;
	const clock = createTestClock();
	const events: EngineEvent[] = [];
	const requests: number[] = [];
	const provider = createMockProvider({ script });
	const session = createSession({
		spec,
		registry: registry(),
		provider: {
			...provider,
			chat: (request, signal) => {
				requests.push(request.messages.length);
				return provider.chat(request, signal);
			}
		},
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(replyContract ? { replyContract } : {})
		}
	});
	session.events.onAny((event) => events.push(event));
	const first = await session.step();
	return { events, first, requests };
}

describe('the reply contract (WP205)', () => {
	it('is a wasted turn without one, as it always was: the words are no call and nothing is said', async () => {
		const { events } = await play([prose]);
		expect(events.find((event) => event.type === 'decision')?.payload).toMatchObject({
			call: null
		});
		expect(spoken).toEqual([]);
	});

	it('say: the words become a call of the say action', async () => {
		const { events } = await play([prose], 'say');
		const call = (events.find((event) => event.type === 'decision')?.payload as { call: unknown })
			.call;
		expect(call).toMatchObject({ name: expect.stringMatching(/say$/) });
		expect(spoken).toEqual([prose.text.trim()]);
	});

	it('retry-with-nudge: asks once more in the same turn, naming the tools, and takes the call that comes', async () => {
		const { events, requests } = await play(
			[prose, turn('Deciding.', 'decide', { outcome: 'x' })],
			'retry-with-nudge'
		);
		// Two provider calls in one tick: the second carries the nudge (two more messages than the first).
		expect(requests).toHaveLength(2);
		expect(requests[1]! - requests[0]!).toBe(2);
		const decisions = events.filter((event) => event.type === 'decision');
		expect(decisions).toHaveLength(1);
		expect(decisions[0]?.payload).toMatchObject({
			call: { name: expect.stringMatching(/decide$/) }
		});
	});

	it('fail: ends the run in error with the reason', async () => {
		const { events, first } = await play([prose], 'fail');
		expect(first.outcome).toBe('ERROR');
		expect(events.some((event) => event.type === 'error')).toBe(true);
	});

	it('says a habit that is the absence of a call on the trace', async () => {
		const { events } = await play([
			{ ...prose, fault: { field: 'habit', chose: 'no-call', shouldHave: 'a tool call' } }
		]);
		expect(events.find((event) => event.type === 'decision.fault')?.payload).toMatchObject({
			action: '(no call)',
			field: 'habit',
			chose: 'no-call'
		});
	});
});

/**
 * **Escalate** (plan 114 WP204): a deny whose disposition is `escalate` refuses the act, tells the bot a person has the case, and ends
 * the run at once — the way out of a block that would otherwise be retried until the turns ran out.
 */
describe('escalate (WP204)', () => {
	it('refuses the act, says a person has the case, and ends the run stopped by the guard', async () => {
		spoken.length = 0;
		const clock = createTestClock();
		const events: EngineEvent[] = [];
		const session = createSession({
			spec,
			registry: registry(),
			provider: createMockProvider({ script: [turn('Deciding.', 'decide', { outcome: 'x' })] }),
			guardrails: [
				{
					id: 'test/escalates',
					name: 'Escalates',
					description: 'Hands every decision to a person.',
					hooks: ['pre-act'],
					check: () => ({ allow: false, reason: 'above the limit', disposition: 'escalate' })
				}
			],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		session.events.onAny((event) => events.push(event));
		const tick = await session.step();
		expect(tick.outcome).toBe('STOPPED_BY_GUARDRAIL');
		const tripped = events.find((event) => event.type === 'guardrail.tripped');
		expect(tripped?.payload).toMatchObject({ disposition: 'escalate', reason: 'above the limit' });
		// The act was never performed.
		expect(events.some((event) => event.type === 'action.performed')).toBe(false);
	});
});
