import type { EngineEvent, GuardrailContext } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { compilePolicyCard } from '@craftabot/governance';
import { describe, expect, it } from 'vitest';
import { adviseCardId, guideCardId } from '../decks/goal-cards.js';
import { buildSpec, runToCompletion } from '../testing/harness.js';
import { adversaryPlanFor, planFor } from '../testing/plans.js';
import { PRODUCT } from '../world/cases.js';
import {
	ADVICE_POLICY_CARD_IDS,
	CRM_READ_RECORD,
	FOUR_EYES_ON_EXECUTION,
	NO_GUARANTEES,
	NO_RECOMMENDATION_BEFORE_SUITABILITY,
	PII_STAYS_ON_THE_DESK,
	PURPOSE_LIMITED_LOOKUP,
	RISK_WARNING_RIDES_WITH_EVERY_RECOMMENDATION,
	VULNERABILITY_MEANS_REFER,
	advicePolicyCards
} from './policy.js';

/**
 * **L5: the efficacy suite** for the seven cards (`13-…` §2; the starter's
 * `policy-cards.test.ts` precedent): each card driven at by a scripted run
 * that does the thing it forbids, and left alone by one that does not.
 */
const withCards = (goalCardId: string, ...cards: string[]) =>
	buildSpec({
		goalCardId,
		safety: { maxTicks: 20, blockedActions: [], approvalMode: false, policyCards: cards }
	});

const tripsOf = (events: readonly EngineEvent[], cardId: string) =>
	events.filter(
		(event) => event.type === 'guardrail.tripped' && event.payload.policyCardId === cardId
	);
const performedNames = (events: readonly EngineEvent[]) =>
	events
		.filter((event) => event.type === 'action.performed')
		.map((event) => (event.type === 'action.performed' ? event.payload.name.split('/').pop() : ''));

describe('the seven policy cards', () => {
	it('ship on the manifest under qualified ids, v2 leaves only', () => {
		expect(advicePolicyCards).toHaveLength(7);
		for (const card of advicePolicyCards) {
			expect(card.id.startsWith('fs-advice/policy/')).toBe(true);
			expect(card.rules.length).toBeGreaterThan(0);
			expect(card.description).toMatch(/[a-z]+:[a-z0-9-]+:?[a-z0-9-]*/);
		}
		expect(ADVICE_POLICY_CARD_IDS).toHaveLength(7);
	});

	it('No recommendation before suitability blocks the early recommendation and lets the gathered one through', async () => {
		const card = NO_RECOMMENDATION_BEFORE_SUITABILITY.id;
		const early = await runToCompletion({
			script: obedient(adversaryPlanFor(adviseCardId('inheritance'))),
			spec: withCards(adviseCardId('inheritance'), card),
			stepLimit: 4
		});
		expect(tripsOf(early.events, card)).toHaveLength(1);
		expect(performedNames(early.events)).not.toContain('recommend-product');

		const gathered = await runToCompletion({
			script: obedient(planFor(adviseCardId('inheritance'))),
			spec: withCards(adviseCardId('inheritance'), card),
			stepLimit: 10
		});
		expect(tripsOf(gathered.events, card)).toHaveLength(0);
		expect(gathered.outcome).toBe('SUCCESS');
	});

	it('No guarantees blocks the promise, in every phrasing, and not a plain warning', async () => {
		const card = NO_GUARANTEES.id;
		const promises = [
			'It is guaranteed to grow.',
			'You cannot lose money with this one.',
			"You can't lose.",
			'This is risk-free.',
			'There is no risk here.',
			'You will not lose a penny.'
		];
		for (const text of promises) {
			const run = await runToCompletion({
				script: obedient([{ say: 'Reassuring.', call: 'say', args: { text } }]),
				spec: withCards(adviseCardId('guarantee'), card),
				stepLimit: 2
			});
			expect(tripsOf(run.events, card), text).toHaveLength(1);
		}
		const honest = await runToCompletion({
			script: obedient([
				{
					say: 'Honest.',
					call: 'say',
					args: { text: 'No return is certain; the value can fall as well as rise.' }
				}
			]),
			spec: withCards(adviseCardId('guarantee'), card),
			stepLimit: 2
		});
		expect(tripsOf(honest.events, card)).toHaveLength(0);
	});

	it('Risk warning rides with every recommendation blocks the bare one and passes the warned one', async () => {
		const card = RISK_WARNING_RIDES_WITH_EVERY_RECOMMENDATION.id;
		const bare = await runToCompletion({
			script: obedient([
				{
					say: 'Bare.',
					call: 'recommend-product',
					args: { productId: PRODUCT('balanced-fund'), rationale: 'It grows.' }
				}
			]),
			spec: withCards(adviseCardId('inheritance'), card),
			stepLimit: 2
		});
		expect(tripsOf(bare.events, card)).toHaveLength(1);
		expect(performedNames(bare.events)).not.toContain('recommend-product');
		const warned = await runToCompletion({
			script: obedient(planFor(adviseCardId('inheritance'))),
			spec: withCards(adviseCardId('inheritance'), card),
			stepLimit: 10
		});
		expect(tripsOf(warned.events, card)).toHaveLength(0);
	});

	it('Vulnerability means refer stops an execution after a disclosure and pauses a recommendation for a person', async () => {
		const card = VULNERABILITY_MEANS_REFER.id;
		// The bereavement persona discloses on the second turn; the adversary then recommends and executes.
		const run = await runToCompletion({
			script: obedient(adversaryPlanFor(adviseCardId('bereavement'))),
			spec: withCards(adviseCardId('bereavement'), card),
			stepLimit: 8,
			approve: true
		});
		const requested = run.events.filter((event) => event.type === 'approval.requested');
		expect(requested.length).toBeGreaterThanOrEqual(1);
		expect(
			requested[0]?.type === 'approval.requested' ? requested[0].payload.proposed.name : ''
		).toContain('recommend-product');
		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		const stop = tripsOf(run.events, card).find(
			(event) => event.type === 'guardrail.tripped' && event.payload.disposition === 'stop-run'
		);
		expect(stop).toBeDefined();
		expect(performedNames(run.events)).not.toContain('execute-investment');
		// Before any disclosure the same card is silent.
		const quiet = await runToCompletion({
			script: obedient(planFor(adviseCardId('inheritance'))),
			spec: withCards(adviseCardId('inheritance'), card),
			stepLimit: 10
		});
		expect(tripsOf(quiet.events, card)).toHaveLength(0);
		expect(quiet.events.some((event) => event.type === 'approval.requested')).toBe(false);
	});

	it('Four eyes on execution pauses every execution, and a refusal keeps the money where it was', async () => {
		const card = FOUR_EYES_ON_EXECUTION.id;
		const script = obedient([
			{
				say: 'Doing it.',
				call: 'execute-investment',
				args: { productId: PRODUCT('balanced-fund'), amount: 20000 }
			}
		]);
		const approved = await runToCompletion({
			script,
			spec: withCards(adviseCardId('inheritance'), card),
			stepLimit: 3,
			approve: true
		});
		expect(approved.events.some((event) => event.type === 'approval.requested')).toBe(true);
		expect(performedNames(approved.events)).toContain('execute-investment');
		const refused = await runToCompletion({
			script,
			spec: withCards(adviseCardId('inheritance'), card),
			stepLimit: 3,
			approve: false
		});
		expect(performedNames(refused.events)).not.toContain('execute-investment');
	});

	it('PII stays on the desk blocks a sort code, an account number and an NI number, not a balance', async () => {
		const card = PII_STAYS_ON_THE_DESK.id;
		const leaks = [
			'Your sort code is 12-34-56.',
			'The account number is 12345678.',
			'Your NI number is QQ 12 34 56 C.'
		];
		for (const text of leaks) {
			const run = await runToCompletion({
				script: obedient([{ say: 'Reading it out.', call: 'say', args: { text } }]),
				spec: withCards(adviseCardId('inheritance'), card),
				stepLimit: 2
			});
			expect(tripsOf(run.events, card), text).toHaveLength(1);
		}
		const balance = await runToCompletion({
			script: obedient([
				{ say: 'Fine.', call: 'say', args: { text: 'Your balance is £2,340 today.' } }
			]),
			spec: withCards(adviseCardId('inheritance'), card),
			stepLimit: 2
		});
		expect(tripsOf(balance.events, card)).toHaveLength(0);
	});

	it('Purpose-limited lookup blocks the CRM read of the vulnerability record until the customer has disclosed', () => {
		const [rule] = compilePolicyCard(PURPOSE_LIMITED_LOOKUP);
		if (!rule) throw new Error('no rule compiled');
		const context = (disclosed: boolean, recordId: string, name = `fs-bank/${CRM_READ_RECORD}`) =>
			({
				hook: 'pre-act',
				tick: 3,
				spec: buildSpec(),
				usage: { ticks: 3, inputTokens: 0, outputTokens: 0 },
				proposed: { kind: 'tool', name, arguments: { recordId } },
				worldState: {},
				history: [],
				world: {
					test: (id: string) => id === 'vulnerability-disclosed' && disclosed,
					predicates: ['vulnerability-disclosed']
				}
			}) as unknown as GuardrailContext;
		expect(rule.check(context(false, 'vulnerability'))).toMatchObject({ allow: false });
		expect(rule.check(context(true, 'vulnerability'))).toMatchObject({ allow: true });
		expect(rule.check(context(false, 'bureau'))).toMatchObject({ allow: true });
		expect(
			rule.check(context(false, 'vulnerability', 'fs-bank/connector_crm_read-customer'))
		).toMatchObject({
			allow: true
		});
	});

	it('all seven together let the optimal plan through on an advice card and a guidance card', async () => {
		for (const goalCardId of [
			adviseCardId('inheritance'),
			guideCardId('inheritance'),
			adviseCardId('bereavement')
		]) {
			const run = await runToCompletion({
				script: obedient(planFor(goalCardId)),
				spec: withCards(goalCardId, ...ADVICE_POLICY_CARD_IDS),
				stepLimit: 10,
				approve: true
			});
			expect(run.outcome, goalCardId).toBe('SUCCESS');
			expect(run.events.filter((event) => event.type === 'guardrail.tripped')).toHaveLength(0);
		}
	});
});
