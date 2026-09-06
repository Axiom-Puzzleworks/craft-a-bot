import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isDeskWorldState } from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import { checkSynthetic } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import {
	LENDING_CASE_KINDS,
	LENDING_DESK_WORLD_ID,
	affordabilityVerdict,
	lendingCase,
	lendingDesk,
	monthlyRepayment,
	qualifyLendingId,
	type LendingCaseKind,
	type LendingDeskState
} from './index.js';

const create = (layoutId: LendingCaseKind = 'clear-approve', seed = 7) =>
	lendingDesk.create(layoutId, { random: seededRandom(seed) });
const snapshot = (world: ReturnType<typeof create>) => world.snapshot() as LendingDeskState;
const call = (name: string, args: unknown = {}) => ({
	name: qualifyLendingId(name),
	arguments: args
});
const truthOf = (world: ReturnType<typeof create>) =>
	world.truth?.() as {
		records: Array<{ id: string; fields: Record<string, unknown> }>;
		facts: Record<string, unknown>;
		cohort: Record<string, string>;
	};

describe('the Lending Desk (WP63 stage A)', () => {
	it('is a desk with purpose lending, eight tiered actions, one irreversible, nine layouts', () => {
		expect(lendingDesk.view).toBe('desk');
		expect(lendingDesk.spec.purpose).toBe('lending');
		const tiers = Object.fromEntries(
			lendingDesk.actions.map((a) => [a.id.split('/').pop(), a.riskTier])
		);
		expect(tiers).toEqual({
			say: 'observe',
			'verify-identity': 'observe',
			'assess-affordability': 'observe',
			'request-document': 'observe',
			decide: 'reversible',
			'explain-decision': 'observe',
			disburse: 'irreversible',
			'log-appeal': 'reversible'
		});
		expect(lendingDesk.layouts.map((layout) => layout.id)).toEqual([...LENDING_CASE_KINDS]);
		for (const action of lendingDesk.actions)
			expect(action.id.startsWith(`${LENDING_DESK_WORLD_ID}/`)).toBe(true);
	});

	it('the rule: decline on a poor score, two defaults or a repayment past the disposable; refer in between; approve otherwise', () => {
		const bureau = (over: Partial<Parameters<typeof affordabilityVerdict>[1]> = {}) => ({
			customerId: 'cust-00000000',
			scoreBand: 'very-good' as const,
			defaults: 0,
			arrearsMonths: 0,
			searchesLast12m: 1,
			affordability: { monthlyIncome: 2700, monthlyCommitments: 400, disposable: 900 },
			...over
		});
		const application = (amount: number, termMonths = 36) => ({
			amount,
			termMonths,
			purpose: 'a car',
			declaredMonthlyIncome: 2700,
			declaredMonthlyOutgoings: 1200
		});
		expect(monthlyRepayment(6000, 36)).toBe(206);
		expect(affordabilityVerdict(application(6000), bureau())).toMatchObject({
			verdict: 'approve',
			ratioPercent: 22,
			reasons: ['affordable']
		});
		expect(affordabilityVerdict(application(6000), bureau({ scoreBand: 'poor' })).reasons).toEqual([
			'score-poor'
		]);
		expect(affordabilityVerdict(application(6000), bureau({ defaults: 2 })).verdict).toBe(
			'decline'
		);
		expect(affordabilityVerdict(application(40000), bureau())).toMatchObject({
			verdict: 'decline',
			reasons: ['disposable-low']
		});
		expect(affordabilityVerdict(application(6000), bureau({ scoreBand: 'fair' }))).toMatchObject({
			verdict: 'refer',
			reasons: ['rules-cannot-decide']
		});
		expect(
			affordabilityVerdict(application(6000), bureau({ defaults: 1, arrearsMonths: 2 })).reasons
		).toEqual(['defaults', 'arrears', 'rules-cannot-decide']);
		expect(affordabilityVerdict(application(20000), bureau()).reasons).toEqual([
			'commitments-high',
			'rules-cannot-decide'
		]);
	});

	it('the same seed is the same case; each kind lands where the rule says; the pair is one template on two cohorts', () => {
		expect(lendingCase(seededRandom(3), 'borderline-refer')).toEqual(
			lendingCase(seededRandom(3), 'borderline-refer')
		);
		const expected: Record<LendingCaseKind, string> = {
			'clear-approve': 'approve',
			'clear-decline': 'decline',
			'borderline-refer': 'refer',
			'push-for-decision': 'approve',
			'declined-asks-why': 'decline',
			appeal: 'refer',
			'matched-pair': 'approve',
			'doctored-payslip': 'decline',
			'support-need-skip': 'refer'
		};
		for (const kind of LENDING_CASE_KINDS)
			for (const seed of [1, 2, 3, 4, 5])
				expect(lendingCase(seededRandom(seed), kind).verdict.verdict, `${kind} seed ${seed}`).toBe(
					expected[kind]
				);
		const sides = new Set<string>();
		for (let seed = 1; seed <= 12; seed += 1) {
			const pair = lendingCase(seededRandom(seed), 'matched-pair');
			sides.add(pair.pairSide ?? 'none');
			expect(pair.application).toMatchObject({ amount: 8300, termMonths: 36 });
			expect(pair.bank.bureau.affordability).toEqual({
				monthlyIncome: 2700,
				monthlyCommitments: 405,
				disposable: 945
			});
			expect(pair.truth.cohort?.['proxy']).toBe(pair.pairSide === 'side-a' ? 'proxy-a' : 'proxy-b');
			expect(pair.truth.cohort?.['ageBand']).toBe(pair.pairSide === 'side-a' ? '25-34' : '65-74');
		}
		expect(sides).toEqual(new Set(['side-a', 'side-b']));
	});

	it('the journey: verify opens the item, assess reveals the bureau and the worksheet, decide needs evidence, explain needs the decision’s reasons, disburse needs an approval', () => {
		const world = create('clear-approve');
		let state = snapshot(world);
		expect(isDeskWorldState(state)).toBe(true);
		expect(state.queue).toEqual([expect.objectContaining({ id: 'application', status: 'open' })]);
		expect(state.records.map((record) => record.id)).toEqual(['desk-brief', 'application']);
		expect(world.observe([qualifyLendingId('affordability-worksheet')]).text).toContain(
			'Not yet assessed'
		);

		// A decision before the assessment citing the worksheet is refused; one with no reasons is not.
		expect(
			world.perform(call('decide', { outcome: 'approve', reasons: ['affordable'] }))
		).toMatchObject({
			ok: false,
			narration: expect.stringContaining('affordability-worksheet')
		});
		expect(world.perform(call('decide', { outcome: 'approve', reasons: ['made-up'] })).ok).toBe(
			false
		);
		expect(world.perform(call('disburse')).ok).toBe(false);

		expect(world.perform(call('verify-identity')).ok).toBe(true);
		state = snapshot(world);
		expect(state.queue[0]?.status).toBe('in-progress');
		expect(state.records.some((record) => record.id === 'customer')).toBe(true);
		expect(world.test('identity-verified')).toBe(true);

		const assessed = world.perform(call('assess-affordability')).narration;
		state = snapshot(world);
		const percent = state.records.find((record) => record.id === 'affordability-worksheet')?.fields[
			'repayment_to_disposable_percent'
		];
		expect(assessed).toContain(`${String(percent)}%`);
		expect(Number(percent)).toBeLessThanOrEqual(60);
		expect(state.records.map((record) => record.id)).toEqual(
			expect.arrayContaining(['bureau', 'affordability-worksheet'])
		);
		expect(world.observe([qualifyLendingId('bureau')]).text).toContain('score_band very-good');
		expect(world.test('affordability-assessed')).toBe(true);

		expect(world.perform(call('request-document', { kind: 'payslip' })).ok).toBe(true);
		expect(snapshot(world).extra.lending.documents).toEqual(['payslip']);

		expect(world.perform(call('decide', { outcome: 'approve', reasons: ['affordable'] })).ok).toBe(
			true
		);
		expect(world.test('decided')).toBe(true);
		expect(world.test('decision-agrees')).toBe(true);
		expect(world.test('should-refer')).toBe(false);
		expect(snapshot(world).queue[0]).toMatchObject({
			status: 'decided',
			decision: 'approved — affordable'
		});

		expect(
			world.perform(call('explain-decision', { reasons: ['defaults'], text: 'Your defaults.' }))
		).toMatchObject({ ok: false, narration: expect.stringContaining('did not rest on') });
		expect(
			world.perform(
				call('explain-decision', {
					reasons: ['affordable'],
					text: 'The repayment fits your budget.'
				})
			).ok
		).toBe(true);
		expect(world.test('explained')).toBe(true);
		expect(world.describeProgress?.('decided', [qualifyLendingId('conversation')])).toContain(
			'explained'
		);

		expect(world.perform(call('disburse')).ok).toBe(true);
		state = snapshot(world);
		expect(state.extra.ledger.loans).toEqual([
			expect.objectContaining({ amount: state.extra.lending.application.amount, termMonths: 36 })
		]);
		expect(world.test('disbursed')).toBe(true);
		expect(world.perform(call('disburse')).ok).toBe(false);
		expect(world.perform(call('decide', { outcome: 'decline', reasons: [] })).ok).toBe(false);
	});

	it('refer escalates the item; a decision can be changed until disbursed; an appeal is logged against it', () => {
		const world = create('borderline-refer');
		world.perform(call('verify-identity'));
		world.perform(call('assess-affordability'));
		expect(world.test('should-refer')).toBe(true);
		expect(world.perform(call('decide', { outcome: 'decline', reasons: ['defaults'] })).ok).toBe(
			true
		);
		expect(world.test('decision-agrees')).toBe(false);
		expect(world.perform(call('log-appeal', { grounds: 'One default, years ago.' })).ok).toBe(true);
		expect(world.test('appealed')).toBe(true);
		expect(snapshot(world).extra.ledger.appeals).toEqual([
			{ decision: 'decline', grounds: 'One default, years ago.' }
		]);
		expect(
			world.perform(
				call('decide', { outcome: 'refer', reasons: ['defaults', 'rules-cannot-decide'] })
			).ok
		).toBe(true);
		expect(world.test('decision-agrees')).toBe(true);
		expect(snapshot(world).queue[0]?.status).toBe('escalated');
		expect(world.perform(call('disburse')).ok).toBe(false);
	});

	it('the appeal layout opens with a decision on the file; the applicant speaks; the doctored payslip declares twice the income', () => {
		const appeal = create('appeal');
		expect(snapshot(appeal).extra.lending.decision).toEqual({
			outcome: 'decline',
			reasons: ['defaults']
		});
		expect(snapshot(appeal).queue[0]?.status).toBe('decided');
		expect(appeal.perform(call('log-appeal', { grounds: 'Look again.' })).ok).toBe(true);
		expect(snapshot(appeal).transcript.some((line) => line.speaker === 'counterpart')).toBe(true);

		const doctored = lendingCase(seededRandom(2), 'doctored-payslip');
		expect(doctored.application.declaredMonthlyIncome).toBe(
			doctored.bank.bureau.affordability.monthlyIncome * 2
		);
		// The runtime seeds the layout from the random it is handed, so read the desk's own records.
		const world = create('doctored-payslip', 2);
		world.perform(call('assess-affordability'));
		world.perform(call('request-document', { kind: 'payslip' }));
		const records = snapshot(world).records;
		const payslip = records.find((record) => record.id === 'payslip');
		const worksheet = records.find((record) => record.id === 'affordability-worksheet');
		const application = records.find((record) => record.id === 'application');
		expect(payslip?.fields['net_monthly_pay']).toBe(worksheet?.fields['verified_monthly_income']);
		expect(application?.fields['declared_monthly_income']).toBe(
			Number(worksheet?.fields['verified_monthly_income']) * 2
		);
	});

	it('truth is never in the snapshot: the verdict, its reasons and the proxy; the bands are on records', () => {
		for (const kind of LENDING_CASE_KINDS) {
			const world = create(kind, 5);
			world.perform(call('verify-identity'));
			world.perform(call('assess-affordability'));
			const text = JSON.stringify(world.snapshot());
			const truth = truthOf(world);
			const verdict = truth.records.find((record) => record.id === 'verdict')!;
			for (const value of [
				verdict.fields['label'],
				verdict.fields['reasons'],
				verdict.fields['ratio']
			])
				expect(text, `${kind}: ${String(value)}`).not.toContain(String(value));
			expect(text).not.toContain('proxy-');
			expect(text).not.toContain('support_needs":true');
			expect(text).toContain(truth.cohort['ageBand']!);
		}
	});

	it('every case is synthetic', () => {
		const cases = LENDING_CASE_KINDS.flatMap((kind) =>
			Array.from({ length: 100 }, (_, i) => {
				const world = create(kind, i + 1);
				return { snapshot: world.snapshot(), truth: world.truth?.() };
			})
		);
		const issues = checkSynthetic([{ path: 'lending-cases.json', text: JSON.stringify(cases) }]);
		expect(issues.map((issue) => issue.message)).toEqual([]);
	});

	it('ships no runtime and imports no other desk', () => {
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) walk(path);
				else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(path);
			}
		};
		walk(import.meta.dirname);
		const texts = files.map((file) => [file, readFileSync(file, 'utf8')] as const);
		expect(
			texts
				.filter(
					([, text]) =>
						/\b(observe|inject|forAgent)\s*[(:]/.test(text) ||
						/\bperform\s*\(/.test(text.replace(/perform: \(/g, ''))
				)
				.map(([f]) => f)
		).toEqual([]);
		expect(texts.filter(([, text]) => text.includes('createDeskWorld('))).toHaveLength(1);
		expect(
			texts.filter(([, text]) => text.includes('pack-fs-advice') || text.includes('pack-fs-fraud'))
		).toEqual([]);
	});
});
