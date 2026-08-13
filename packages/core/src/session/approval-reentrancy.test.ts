import { describe, expect, it } from 'vitest';
import { createSession } from './agent-session.js';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import { createMockProvider, createTestClock, turn } from '../testing/index.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { Guardrail } from '../types/guardrail.js';
import type { WorldDefinition, WorldInstance } from '../types/world.js';

/**
 * **Approval re-entrancy** (`13-…` §4.6).
 *
 * Approval is the only place the engine deliberately stops mid-tick and hands
 * control to somebody else, which makes it the only place a second thing can
 * happen while the first is still in flight. `08-…` §7.3 promises that no
 * action is ever performed between `approval.requested` and
 * `approval.resolved` — a promise that is only worth what its edge cases are
 * worth, and the edge cases were untested.
 *
 * Three of them, all reachable from the UI by an impatient child: pressing
 * stop while the approval card is up; the card resolving twice; and a run in
 * play mode meeting an approval it has to wait for.
 */

function createTinyWorld(): WorldDefinition {
	return {
		id: 'tiny/world',
		name: 'Tiny world',
		layouts: [{ id: 'only', name: 'Only layout', initialState: { pings: 0 } }],
		actions: [
			{ id: 'ping', name: 'Ping', description: 'Make a noise.', parameters: { type: 'object' } }
		],
		senses: [{ id: 'look', name: 'Look', description: 'See.' }],
		predicates: { 'has-won': 'Never true — these runs end another way.' },
		create(): WorldInstance {
			const state = { pings: 0 };
			return {
				snapshot: () => ({ ...state }),
				observe: (channels) => ({
					channels: [...channels],
					text: `pings: ${state.pings}`,
					data: {}
				}),
				perform: () => {
					state.pings += 1;
					return { ok: true, narration: 'ping!', stateDiff: [] };
				},
				test: () => false,
				reset: () => {
					state.pings = 0;
				}
			};
		}
	};
}

function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'tiny',
		name: 'Tiny pack',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		worlds: [createTinyWorld()],
		cartridges: [
			{
				id: 'tiny/brain',
				providerId: 'mock',
				model: 'tiny-model-1',
				displayName: 'Tiny brain',
				blurb: 'Small.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'tiny/goal',
				title: 'Ping about',
				goalText: 'Ping about.',
				worldId: 'tiny/world',
				layoutId: 'only',
				successCondition: 'has-won',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

const spec: AgentSpec = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Tinybot',
	bricks: {
		llm: { cartridgeId: 'tiny/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['look'] },
		actions: { enabled: ['ping'] }
	},
	goalCardId: 'tiny/goal',
	createdAt: '2026-08-13T09:00:00Z',
	updatedAt: '2026-08-13T09:00:00Z',
	schemaVersion: 1
};

/** Pauses every action, exactly as the Safety brick's approval mode does. */
const alwaysAsk: Guardrail = {
	id: 'test/always-ask',
	name: 'Always ask',
	description: 'Asks a person about everything.',
	hooks: ['pre-act'],
	check: (ctx) =>
		ctx.proposed ? { pause: true, reason: 'Checking with a person.' } : { allow: true }
};

function makeSession(budgets?: { maxTicks?: number }) {
	const clock = createTestClock();
	const session = createSession({
		spec,
		registry: buildRegistry(),
		provider: createMockProvider({ script: () => turn('Ping.', 'ping') }),
		guardrails: [alwaysAsk],
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(budgets ? { budgets } : {})
		}
	});
	const seen: string[] = [];
	session.events.onAny((event) => seen.push(event.type));
	/** Resolves when the card would be on screen — the provider call is async. */
	const asked = new Promise<void>((resolve) => {
		session.events.on('approval.requested', () => resolve());
	});
	return { session, seen, asked };
}

describe('an approval that is still waiting', () => {
	it('holds the tick open until somebody answers', async () => {
		const { session, seen, asked } = makeSession({ maxTicks: 2 });
		const tick = session.step();
		await asked;

		expect(session.status).toBe('awaiting-approval');
		expect(seen).toContain('approval.requested');
		expect(seen).not.toContain('action.performed');

		session.resolveApproval(true);
		await tick;
		expect(seen).toContain('action.performed');
	});

	it('performs nothing between the request and the answer', async () => {
		// `08-…` §7.3, asserted on the event order rather than on the outcome.
		const { session, seen, asked } = makeSession({ maxTicks: 2 });
		const tick = session.step();
		await asked;
		session.resolveApproval(true);
		await tick;

		const requested = seen.indexOf('approval.requested');
		const resolved = seen.indexOf('approval.resolved');
		const performed = seen.indexOf('action.performed');
		expect(requested).toBeGreaterThanOrEqual(0);
		expect(resolved).toBeGreaterThan(requested);
		expect(performed).toBeGreaterThan(resolved);
	});

	it('ignores a second answer to the same question', async () => {
		// The card can be double-tapped, and a second resolve must not resume a
		// tick that has already resumed — or worse, act twice.
		const { session, seen, asked } = makeSession({ maxTicks: 2 });
		const tick = session.step();
		await asked;

		session.resolveApproval(true);
		session.resolveApproval(false);
		await tick;

		expect(seen.filter((type) => type === 'approval.resolved')).toHaveLength(1);
		expect(seen.filter((type) => type === 'action.performed')).toHaveLength(1);
	});

	it('lets a person stop the run while the question is still on screen', async () => {
		const { session, seen, asked } = makeSession({ maxTicks: 2 });
		const tick = session.step();
		await asked;
		expect(session.status).toBe('awaiting-approval');

		session.stop();
		// Nothing has answered the question, so the tick is still parked; the
		// answer that finally arrives must not undo the stop.
		session.resolveApproval(true);
		await tick;

		expect(session.status).toBe('finished');
		expect(seen).toContain('run.finished');
	});

	it('survives an answer that arrives after the run has finished', async () => {
		const { session, asked } = makeSession({ maxTicks: 1 });
		const tick = session.step();
		await asked;
		session.resolveApproval(true);
		await tick;

		expect(() => session.resolveApproval(true)).not.toThrow();
		expect(session.status).toBe('finished');
	});
});
