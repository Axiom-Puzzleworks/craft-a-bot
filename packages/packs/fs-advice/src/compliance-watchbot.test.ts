import { describe, expect, it } from 'vitest';
import { createSessionGroup, toSpecV2, type EngineEvent } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import {
	counterpartScriptFor,
	counterpartSpec,
	deskFor,
	scriptedCounterpart
} from '@craftabot/evals';
import { createComplianceWatchbot } from '@craftabot/pack-monitor';
import { adviseCardId } from './decks/goal-cards.js';
import { SUITABILITY_COMPLETE_ID, suitabilityComplete } from './evaluators/deterministic.js';
import { buildRegistry, buildSpec } from './testing/index.js';
import { PRODUCT } from './world/cases.js';
import { REQUIRED_TOPICS } from './world/extra.js';

/**
 * The Compliance Watchbot on an Advice Desk episode (WP64, `56-…` §4.3,
 * §11 item 3), over the scripted tier: the seat across the desk is the
 * case's own person driven along their script through a mock, the clerk a
 * scripted brain, the Watchbot at the group's chokepoint with the desk's
 * suitability evaluator as its breaker. A clerk who recommends before
 * asking is stopped on the next round with the evaluator's own words; a
 * clerk who gathers first is never stopped.
 *
 * On `suitability-complete` failing rather than `recommendation-suitable`
 * saying `unsuitable`: the second reads truth, and truth never reaches a
 * chokepoint mid-run (`56-…` §2 item 11) — the conduct rule the trace can
 * judge is the one the breaker breaks on.
 */
const CARD = adviseCardId('rainy-day');
const recommend = {
	say: 'A fund, then.',
	call: 'recommend-product',
	args: { productId: PRODUCT('balanced-fund'), rationale: 'It grows. Capital at risk.' }
};
const gather = REQUIRED_TOPICS.map((topic) => ({
	say: `About their ${topic}.`,
	call: 'ask-suitability-question',
	args: { topic }
}));

async function episode(clerkSteps: Array<{ say: string; call: string; args: unknown }>) {
	const registry = buildRegistry();
	const clock = createTestClock({ seed: 3 });
	const { card, world } = deskFor(registry, CARD);
	const rootWorld = world.create(card.layoutId, { random: clock.random });
	const { script } = counterpartScriptFor(registry, CARD, rootWorld);
	const seat = counterpartSpec(
		script,
		CARD,
		world.id,
		'test/mock-brain',
		clock.newId(),
		clock.now()
	);
	const watchbot = createComplianceWatchbot({
		watchFor: ['monitor/going-in-circles'],
		breakOn: [{ evaluator: suitabilityComplete, onFail: true }]
	});
	const events: EngineEvent[] = [];
	const group = createSessionGroup({
		members: [
			{
				spec: toSpecV2(buildSpec({ goalCardId: CARD })),
				provider: createMockProvider({ script: obedient(clerkSteps) }),
				role: 'agent'
			},
			{
				spec: toSpecV2(seat),
				provider: createMockProvider({
					id: 'mock-seat',
					script: scriptedCounterpart(script, { selfName: script.name })
				}),
				role: 'counterpart'
			}
		],
		registry,
		goalCardId: CARD,
		world: rootWorld,
		groupGuardrails: watchbot.guardrails,
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			maxRounds: 12,
			observers: [watchbot.observe]
		}
	});
	group.events.onAny((event) => events.push(event));
	group.start('step');
	for (let round = 0; round < 14; round += 1) {
		const result = await group.stepRound();
		if (result.outcome) break;
	}
	return { events, script };
}

describe('the Compliance Watchbot on the Advice Desk (WP64)', () => {
	it('stops the episode on the round after a recommendation made before suitability was gathered', async () => {
		const { events } = await episode([recommend, recommend, recommend]);
		const trip = events.find(
			(event) =>
				event.type === 'guardrail.tripped' &&
				event.payload.guardrailId === `monitor/evaluator-breaker:${SUITABILITY_COMPLETE_ID}`
		);
		expect(trip).toBeDefined();
		expect(trip?.type === 'guardrail.tripped' && trip.payload.reason).toContain(
			'Recommended without asking about'
		);
		expect(trip?.type === 'guardrail.tripped' && trip.payload.disposition).toBe('stop-run');
		const finished = events.find((event) => event.type === 'group.finished');
		expect(finished?.type === 'group.finished' && finished.payload.outcome).toBe(
			'STOPPED_BY_GUARDRAIL'
		);
		// Stopped before the person across the desk had a turn: the breaker sits at every seat's pre-think.
		expect(events.filter((event) => event.type === 'action.performed')).toHaveLength(1);
	});

	it('never stops a clerk who gathers suitability before recommending', async () => {
		const { events } = await episode([...gather, recommend]);
		expect(
			events.some(
				(event) =>
					event.type === 'guardrail.tripped' &&
					event.payload.guardrailId.startsWith('monitor/evaluator-breaker:')
			)
		).toBe(false);
		// The person across the desk had their turns: the seat's own run is on the merged stream, tick after tick.
		const agentRunId = events.find((event) => event.type === 'run.started')?.runId;
		expect(
			events.filter((event) => event.type === 'tick.completed' && event.runId !== agentRunId).length
		).toBeGreaterThan(0);
		// The breaker still looked, every round, and said so.
		expect(
			events.some(
				(event) =>
					event.type === 'guardrail.checked' &&
					event.payload.guardrailId === `monitor/evaluator-breaker:${SUITABILITY_COMPLETE_ID}`
			)
		).toBe(true);
	});
});
