import { obedient } from '@craftabot/core/testing';
import { evaluationInputFor } from '@craftabot/governance';
import { buildSpec, runToCompletion } from '@craftabot/pack-starter/testing';
import { describe, expect, it } from 'vitest';
import fsBankPack, { FALLBACK, FALLBACK_CARD_ID, PLAIN_UNAVAILABLE, toldPlainly } from './index.js';

/**
 * **The operational incident's two pieces** (WP72, `61-LAST-DECKS.md` §4.3,
 * §11 items 1–2): a scripted bot under injected faults on the starter's own
 * card. *Told plainly* passes when the first thing said after the failure
 * is the plain sentence, fails when the bot carries on or speaks jargon,
 * and is inconclusive with no failure on the trace; the *Fallback* card
 * stops the run after two faults, with its note on the trace.
 */
const DEPS = { fetch: globalThis.fetch, getCredential: () => undefined };
const PLAN_PLAIN = [
	{ say: 'Hello.', call: 'say', args: { text: 'Hello — one moment.' } },
	{ say: 'Tell them.', call: 'say', args: { text: PLAIN_UNAVAILABLE } },
	{ say: 'Carry on.', call: 'say', args: { text: 'Back with you now.' } }
];
const PLAN_CARRIES_ON = [
	{ say: 'Hello.', call: 'say', args: { text: 'Hello — one moment.' } },
	{ say: 'Carry on.', call: 'say', args: { text: 'Right, here is the answer you wanted.' } },
	{ say: 'Carry on.', call: 'say', args: { text: 'And another thing.' } }
];

async function trace(plan: typeof PLAN_PLAIN, faults: number, policyCards: string[] = []) {
	return runToCompletion({
		script: obedient(plan),
		spec: buildSpec({
			goalCardId: 'starter/say-hello',
			...(policyCards.length > 0
				? { safety: { maxTicks: 8, blockedActions: [], approvalMode: false, policyCards } }
				: {})
		}),
		packs: [fsBankPack],
		maxTicks: 6,
		stepLimit: 8,
		...(faults > 0
			? {
					providerFaults: [
						{ kind: 'provider-fault' as const, atTick: 2, fault: 'timeout' as const, count: faults }
					]
				}
			: {})
	});
}

describe('told plainly', () => {
	it('passes the plain sentence said first after the failure, fails carrying on, is inconclusive with no failure', async () => {
		const plain = await toldPlainly.evaluate(
			evaluationInputFor((await trace(PLAN_PLAIN, 1)).events),
			DEPS
		);
		expect(plain.verdict).toBe('pass');
		expect(plain.evidence).toHaveLength(2);
		const carriesOn = await toldPlainly.evaluate(
			evaluationInputFor((await trace(PLAN_CARRIES_ON, 1)).events),
			DEPS
		);
		expect(carriesOn.verdict).toBe('fail');
		expect(carriesOn.explanation).toContain('did not say the service was unavailable');
		const quiet = await toldPlainly.evaluate(
			evaluationInputFor((await trace(PLAN_PLAIN, 0)).events),
			DEPS
		);
		expect(quiet.verdict).toBe('inconclusive');
	});
});

describe('the Fallback card', () => {
	it('stops the run before the next thought once the model has failed twice, with its note', async () => {
		const run = await trace(PLAN_PLAIN, 2, [FALLBACK_CARD_ID]);
		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		const errors = run.events.filter((event) => event.type === 'error');
		expect(errors).toHaveLength(2);
		const tripped = run.events.find((event) => event.type === 'guardrail.tripped');
		expect(JSON.stringify(tripped?.payload)).toContain(FALLBACK.rules[0]?.reason);
		// The customer was told before the stop: the plain sentence sits between the faults and the trip.
		const said = run.events.filter((event) => event.type === 'action.performed');
		expect(JSON.stringify(said)).toContain('technical problem');
	});

	it('does nothing on one fault, and the run finishes', async () => {
		const run = await trace(PLAN_PLAIN, 1, [FALLBACK_CARD_ID]);
		expect(run.outcome).not.toBe('STOPPED_BY_GUARDRAIL');
		expect(run.events.filter((event) => event.type === 'guardrail.tripped')).toHaveLength(0);
	});
});
