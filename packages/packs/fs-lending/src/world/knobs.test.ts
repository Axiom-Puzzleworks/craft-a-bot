import { seededRandom } from '@craftabot/desk';
import { bankCase } from '@craftabot/pack-fs-bank';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { DISBURSEMENT_IS_FOUR_EYES, NO_DECISION_BEFORE_AFFORDABILITY } from '../cards/policy.js';
import { lendingCardId } from '../decks/goal-cards.js';
import { buildSpec, runToCompletion } from '../testing/harness.js';
import { planFor } from '../testing/plans.js';
import { lendingCase } from './cases.js';
import { lendingDesk } from './desk.js';
import {
	DEFAULT_LENDING_POLICY,
	LENDING_KNOB_IDS,
	LENDING_RATE,
	affordabilityVerdict,
	affordabilityVerdictWith,
	lendingPolicyFrom,
	monthlyRepayment,
	monthlyRepaymentWith,
	type Application
} from './rules.js';

/**
 * **The lending knobs** (WP78, `64-…` §6.6.2; `65-…` §3's DoD): the default
 * policy is today's rule to the digit; a knob sweep moves the approval
 * rate monotonically; the desk's truth follows the knobs it was created
 * with; and each card with a threshold follows its knob.
 */
const ROWS = 500;
const application = (amount: number, termMonths = 36): Application => ({
	amount,
	termMonths,
	purpose: 'a car',
	declaredMonthlyIncome: 2500,
	declaredMonthlyOutgoings: 900
});
/** Five hundred ordinary applicants: the bank's bureaus, one loan shape, the amount scaled to income. */
const rows = Array.from({ length: ROWS }, (_, index) => {
	const { bureau } = bankCase(index + 1, { transactionsPerAccount: 0 });
	return { bureau, application: application(Math.round(bureau.affordability.monthlyIncome * 4)) };
});
const approvalRate = (
	verdict: (a: Application, b: (typeof rows)[number]['bureau']) => { verdict: string }
) => rows.filter((row) => verdict(row.application, row.bureau).verdict === 'approve').length / ROWS;
const declineRate = (
	verdict: (a: Application, b: (typeof rows)[number]['bureau']) => { verdict: string }
) => rows.filter((row) => verdict(row.application, row.bureau).verdict === 'decline').length / ROWS;

const withCards = (goalCardId: string, ...cards: string[]) =>
	buildSpec({
		goalCardId,
		safety: { maxTicks: 20, blockedActions: [], approvalMode: false, policyCards: cards }
	});
const performedOk = (events: readonly { type: string; payload: unknown }[], name: string) =>
	events.some(
		(event) =>
			event.type === 'action.performed' &&
			((event.payload as { name: string }).name.split('/').pop() ?? '') === name &&
			(event.payload as { result: { ok: boolean } }).result.ok
	);

describe('DEFAULT_LENDING_POLICY is the rule as it was', () => {
	it('names every knob with its shipped constant', () => {
		expect(DEFAULT_LENDING_POLICY).toEqual({
			rateBps: 790,
			referRatioPercent: 60,
			declineRatioPercent: 100,
			declineOnDefaults: 2,
			referOnSearches: 3,
			referOnFair: true,
			fourEyes: 'approve',
			documentBefore: 'never'
		});
		expect(LENDING_RATE).toBe(0.079);
		expect(LENDING_KNOB_IDS).toEqual(Object.keys(DEFAULT_LENDING_POLICY));
	});

	it('reproduces the repayment and the verdict over five hundred bureaus, to the digit', () => {
		const verdict = affordabilityVerdictWith(DEFAULT_LENDING_POLICY);
		const repayment = monthlyRepaymentWith(DEFAULT_LENDING_POLICY);
		for (const row of rows) {
			expect(verdict(row.application, row.bureau)).toEqual(
				affordabilityVerdict(row.application, row.bureau)
			);
			expect(repayment(row.application.amount, 36)).toBe(
				monthlyRepayment(row.application.amount, 36)
			);
		}
		expect(monthlyRepayment(6000, 36)).toBe(206);
	});

	it('lendingPolicyFrom: nothing is the default, a knob merges, a misspelt value throws, a stranger is ignored', () => {
		expect(lendingPolicyFrom(undefined)).toEqual(DEFAULT_LENDING_POLICY);
		expect(lendingPolicyFrom({})).toEqual(DEFAULT_LENDING_POLICY);
		expect(lendingPolicyFrom({ referRatioPercent: 50 })).toEqual({
			...DEFAULT_LENDING_POLICY,
			referRatioPercent: 50
		});
		expect(lendingPolicyFrom({ fraudSomething: 3 })).toEqual(DEFAULT_LENDING_POLICY);
		expect(() => lendingPolicyFrom({ referRatioPercent: 'sixty' })).toThrow(/referRatioPercent/);
		expect(() => lendingPolicyFrom({ fourEyes: 'sometimes' })).toThrow(/fourEyes/);
	});
});

describe('a knob sweep', () => {
	it('loosening the refer ratio raises the approval rate monotonically', () => {
		const rates = [40, 50, 60, 70, 80, 90].map((referRatioPercent) =>
			approvalRate(affordabilityVerdictWith({ ...DEFAULT_LENDING_POLICY, referRatioPercent }))
		);
		for (let index = 1; index < rates.length; index += 1) {
			expect(rates[index], `refer ratio step ${index}`).toBeGreaterThanOrEqual(rates[index - 1]!);
		}
		expect(rates.at(-1)).toBeGreaterThan(rates[0]!);
	});

	it('loosening the decline ratio lowers the decline rate monotonically', () => {
		const rates = [60, 80, 100, 120, 150].map((declineRatioPercent) =>
			declineRate(affordabilityVerdictWith({ ...DEFAULT_LENDING_POLICY, declineRatioPercent }))
		);
		for (let index = 1; index < rates.length; index += 1) {
			expect(rates[index], `decline ratio step ${index}`).toBeLessThanOrEqual(rates[index - 1]!);
		}
		expect(rates.at(-1)).toBeLessThan(rates[0]!);
	});

	it('the rate moves the repayment, and the repayment moves the verdict, in the same direction', () => {
		const cheap = approvalRate(
			affordabilityVerdictWith({ ...DEFAULT_LENDING_POLICY, rateBps: 100 })
		);
		const dear = approvalRate(
			affordabilityVerdictWith({ ...DEFAULT_LENDING_POLICY, rateBps: 2500 })
		);
		expect(cheap).toBeGreaterThanOrEqual(dear);
	});
});

describe('the desk under knobs', () => {
	it('the truth follows the knobs the world was created with, and the snapshot carries them', () => {
		const random = () => seededRandom(7);
		const strict = lendingDesk.create('clear-approve', {
			random: random(),
			config: { knobs: { referRatioPercent: 20 } }
		});
		const lax = lendingDesk.create('clear-approve', { random: random() });
		const factsOf = (world: typeof strict) =>
			(world.truth?.() as { facts?: Record<string, unknown> } | undefined)?.facts ?? {};
		expect(factsOf(lax)['verdict']).toBe('should-approve');
		expect(factsOf(strict)['verdict']).toBe('should-refer');
		expect((strict.snapshot() as { config?: unknown }).config).toEqual({
			knobs: { referRatioPercent: 20 }
		});
		expect((lax.snapshot() as { config?: unknown }).config).toBeUndefined();
	});

	it('lendingCase with the default policy is lendingCase as it was', () => {
		const a = lendingCase(seededRandom(11), 'borderline-refer');
		const b = lendingCase(seededRandom(11), 'borderline-refer', DEFAULT_LENDING_POLICY);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

describe('each card follows its knob', () => {
	const worldWith = (layoutId: string, knobs: Record<string, unknown>) =>
		lendingDesk.create(layoutId, { random: seededRandom(3), config: { knobs } });

	it('Disbursement is four-eyes: `none` pauses nothing, `approve` pauses the payout, `all` pauses the decision too', async () => {
		const card = DISBURSEMENT_IS_FOUR_EYES.id;
		const spec = withCards(lendingCardId('clear-approve'), card);
		const plan = obedient(planFor(lendingCardId('clear-approve')));

		const none = await runToCompletion({
			script: plan,
			spec,
			stepLimit: 7,
			world: worldWith('clear-approve', { fourEyes: 'none' })
		});
		expect(none.events.some((event) => event.type === 'approval.requested')).toBe(false);
		expect(performedOk(none.events, 'disburse')).toBe(true);

		const approve = await runToCompletion({
			script: plan,
			spec,
			stepLimit: 7,
			approve: true,
			world: worldWith('clear-approve', { fourEyes: 'approve' })
		});
		const pausedOn = (events: typeof approve.events) =>
			events
				.filter((event) => event.type === 'approval.requested')
				.map((event) =>
					(event.payload as { proposed: { name: string } }).proposed.name.split('/').pop()
				);
		expect(pausedOn(approve.events)).toEqual(['disburse']);

		const all = await runToCompletion({
			script: plan,
			spec,
			stepLimit: 7,
			approve: true,
			world: worldWith('clear-approve', { fourEyes: 'all' })
		});
		expect(pausedOn(all.events)).toEqual(['decide', 'disburse']);
	});

	it('No decision before affordability: `documentBefore: always` blocks the decision until a payslip is on the desk', async () => {
		const card = NO_DECISION_BEFORE_AFFORDABILITY.id;
		const spec = withCards(lendingCardId('clear-approve'), card);
		const plan = obedient(planFor(lendingCardId('clear-approve')));
		const blocked = await runToCompletion({
			script: plan,
			spec,
			stepLimit: 7,
			world: worldWith('clear-approve', { documentBefore: 'always' })
		});
		expect(
			blocked.events.some(
				(event) =>
					event.type === 'guardrail.tripped' &&
					(event.payload as { policyCardId?: string }).policyCardId === card
			)
		).toBe(true);
		expect(performedOk(blocked.events, 'decide')).toBe(false);

		const asked = await runToCompletion({
			script: obedient([
				{ say: 'Verify.', call: 'verify-identity', args: {} },
				{ say: 'Assess.', call: 'assess-affordability', args: {} },
				{ say: 'Payslip.', call: 'request-document', args: { kind: 'payslip' } },
				...planFor(lendingCardId('clear-approve')).filter(
					(step) => step.call !== 'verify-identity' && step.call !== 'assess-affordability'
				)
			]),
			spec,
			stepLimit: 9,
			world: worldWith('clear-approve', { documentBefore: 'always' })
		});
		expect(performedOk(asked.events, 'decide')).toBe(true);

		const never = await runToCompletion({ script: plan, spec, stepLimit: 7 });
		expect(performedOk(never.events, 'decide')).toBe(true);
	});

	it('Refer when the rules say refer follows the refer ratio through the truth', async () => {
		const strict = worldWith('clear-approve', { referRatioPercent: 20 });
		expect(strict.test('should-refer')).toBe(true);
		const lax = lendingDesk.create('clear-approve', { random: seededRandom(3) });
		expect(lax.test('should-refer')).toBe(false);
	});
});
