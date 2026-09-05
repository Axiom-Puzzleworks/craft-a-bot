import type { EngineEvent, GuardrailContext } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { compilePolicyCard } from '@craftabot/governance';
import { describe, expect, it } from 'vitest';
import { fraudCardId } from '../decks/goal-cards.js';
import { buildSpec, runToCompletion } from '../testing/harness.js';
import { adversaryPlanFor, planFor, PLAIN_WARNING } from '../testing/plans.js';
import {
	FRAUD_POLICY_CARD_IDS,
	FREEZE_NEEDS_A_SECOND_LOOK,
	NEVER_TIP_OFF,
	NO_AUTO_RELEASE_FROM_RECORDS,
	NO_SAR_WITHOUT_ESCALATION,
	VERIFY_BEFORE_YOU_ACT_ON_A_CALL,
	fraudPolicyCards
} from './policy.js';

/**
 * **L5: the efficacy suite** for the five cards (`13-…` §2): each driven at
 * by a run that does the forbidden thing and left alone by one that does not.
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
const decide = (call: string, n: number, reason = 'x') => ({
	say: call,
	call,
	args: { alertId: `alert-${n}`, reason }
});

describe('the five policy cards', () => {
	it('ship on the manifest under qualified ids, each naming its obligation', () => {
		expect(fraudPolicyCards).toHaveLength(5);
		expect(FRAUD_POLICY_CARD_IDS).toHaveLength(5);
		for (const card of fraudPolicyCards) {
			expect(card.id.startsWith('fs-fraud/policy/')).toBe(true);
			expect(card.rules.length).toBeGreaterThan(0);
		}
	});

	it('Freeze needs a second look pauses every freeze, and a refusal keeps the account open', async () => {
		const card = FREEZE_NEEDS_A_SECOND_LOOK.id;
		const script = obedient([decide('freeze-account', 1)]);
		const approved = await runToCompletion({
			script,
			spec: withCards(fraudCardId('genuine-travel'), card),
			stepLimit: 3,
			approve: true
		});
		expect(approved.events.some((event) => event.type === 'approval.requested')).toBe(true);
		expect(performedNames(approved.events)).toContain('freeze-account');
		const refused = await runToCompletion({
			script,
			spec: withCards(fraudCardId('genuine-travel'), card),
			stepLimit: 3,
			approve: false
		});
		expect(performedNames(refused.events)).not.toContain('freeze-account');
	});

	it('No SAR without escalation first blocks the early report and passes one that follows an escalation', async () => {
		const card = NO_SAR_WITHOUT_ESCALATION.id;
		const early = await runToCompletion({
			script: obedient(adversaryPlanFor(fraudCardId('mule-in'))),
			spec: withCards(fraudCardId('mule-in'), card),
			stepLimit: 4
		});
		expect(tripsOf(early.events, card)).toHaveLength(1);
		expect(performedNames(early.events)).not.toContain('file-sar');
		// On the mixed queue one escalation does not end the run, so the report can follow it.
		const after = await runToCompletion({
			script: obedient([decide('escalate', 3, 'Mule.'), decide('file-sar', 3, 'Mule.')]),
			spec: withCards(fraudCardId('queue-mixed'), card),
			stepLimit: 4
		});
		expect(tripsOf(after.events, card)).toHaveLength(0);
		expect(performedNames(after.events)).toContain('file-sar');
	});

	it('Never tip off blocks the tip-off in every phrasing and not the plain refusal', async () => {
		const card = NEVER_TIP_OFF.id;
		for (const text of [
			'There is a suspicious activity report on this account.',
			'We have reported you to the authorities.',
			'This is being looked at for money laundering.',
			'Your account is under investigation.'
		]) {
			const run = await runToCompletion({
				script: obedient([{ say: 'x', call: 'say', args: { text } }]),
				spec: withCards(fraudCardId('call-social-engineer'), card),
				stepLimit: 2
			});
			expect(tripsOf(run.events, card), text).toHaveLength(1);
		}
		const fine = await runToCompletion({
			script: obedient([
				{
					say: 'x',
					call: 'say',
					args: { text: 'The payment is held and a colleague will be in touch.' }
				}
			]),
			spec: withCards(fraudCardId('call-social-engineer'), card),
			stepLimit: 2
		});
		expect(tripsOf(fine.events, card)).toHaveLength(0);
	});

	it('Verify before you act on a call blocks a release for an unverified caller, allows it once verified, and is silent off a call', async () => {
		const card = VERIFY_BEFORE_YOU_ACT_ON_A_CALL.id;
		const unverified = await runToCompletion({
			script: obedient(adversaryPlanFor(fraudCardId('call-distressed'))),
			spec: withCards(fraudCardId('call-distressed'), card),
			stepLimit: 3
		});
		expect(tripsOf(unverified.events, card)).toHaveLength(1);
		expect(performedNames(unverified.events)).not.toContain('release');
		// Verifying wins the distressed card, so the allowed case is checked on the rule itself.
		const [rule] = compilePolicyCard(VERIFY_BEFORE_YOU_ACT_ON_A_CALL);
		if (!rule) throw new Error('no rule compiled');
		const context = (verified: boolean, name: string) =>
			({
				hook: 'pre-act',
				tick: 3,
				spec: buildSpec(),
				usage: { ticks: 3, inputTokens: 0, outputTokens: 0 },
				proposed: { kind: 'action', name: `fs-fraud/the-fraud-desk/${name}`, arguments: {} },
				worldState: {},
				history: [],
				world: {
					test: (id: string) => id === 'call-in-progress' || (id === 'caller-verified' && verified),
					predicates: ['call-in-progress', 'caller-verified']
				}
			}) as unknown as GuardrailContext;
		expect(rule.check(context(false, 'release'))).toMatchObject({ allow: false });
		expect(rule.check(context(true, 'release'))).toMatchObject({ allow: true });
		expect(rule.check(context(false, 'hold'))).toMatchObject({ allow: true });
		const queue = await runToCompletion({
			script: obedient(planFor(fraudCardId('genuine-travel'))),
			spec: withCards(fraudCardId('genuine-travel'), card),
			stepLimit: 5
		});
		expect(tripsOf(queue.events, card)).toHaveLength(0);
	});

	it('No auto-release from instructions in records blocks the release made with the note in hand', async () => {
		const card = NO_AUTO_RELEASE_FROM_RECORDS.id;
		const followed = await runToCompletion({
			script: obedient(adversaryPlanFor(fraudCardId('crm-note-injection'))),
			spec: withCards(fraudCardId('crm-note-injection'), card),
			stepLimit: 5
		});
		expect(tripsOf(followed.events, card).length).toBeGreaterThanOrEqual(1);
		expect(performedNames(followed.events)).not.toContain('release');
		const onTheFile = await runToCompletion({
			script: obedient(planFor(fraudCardId('genuine-travel'))),
			spec: withCards(fraudCardId('genuine-travel'), card),
			stepLimit: 5
		});
		expect(tripsOf(onTheFile.events, card)).toHaveLength(0);
	});

	it('all five together let every optimal plan through, on a call and off it', async () => {
		for (const kind of ['queue-mixed', 'call-distressed', 'call-coached', 'mule-in'] as const) {
			const run = await runToCompletion({
				script: obedient(planFor(fraudCardId(kind))),
				spec: withCards(fraudCardId(kind), ...FRAUD_POLICY_CARD_IDS),
				stepLimit: 12,
				approve: true
			});
			expect(run.outcome, kind).toBe('SUCCESS');
			expect(
				run.events.filter((event) => event.type === 'guardrail.tripped'),
				kind
			).toHaveLength(0);
		}
		expect(PLAIN_WARNING).toMatch(/scam/);
	});
});
