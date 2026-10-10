import { parseCampaign, prepareCampaign, runCampaign } from '@craftabot/evals';
import fsBankPack, { population } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { lendingBook } from './book.js';
import { lendingBookCampaign } from './campaign.js';
import fsLendingPack from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';
import {
	GREY_KNOBS,
	greyApplication,
	lendingCaseFromItem,
	type ApplicationItemPayload
} from './world/cases.js';
import {
	DEFAULT_LENDING_POLICY,
	lendingPolicySchema,
	verdictFromFigures,
	type RuleFigures
} from './world/rules.js';

/**
 * **The grey zone** (plan 114 WP200, D2): cases the rule's arithmetic does not settle, where the policy — stated on the case file —
 * says refer. Off unless a book asks for it, so every other book is as it was; on, the shaped items' truth, the rules-only path and
 * the scripted-optimal bot (which reads the rule it is shown) all give the policy's answer.
 */
const base: RuleFigures = {
	scoreBand: 'very-good',
	defaults: 0,
	arrearsMonths: 0,
	searchesLast12m: 1,
	ratioPercent: 30
};
const policyWith = (knobs: object) => lendingPolicySchema.parse(knobs);

describe('the rule in the grey zone', () => {
	it('is the rule as it was with the knobs off, whatever the figures say', () => {
		const figures = {
			...base,
			ratioPercent: 59,
			declaredIncome: 4000,
			verifiedIncome: 2000,
			incomeVerified: false
		};
		expect(verdictFromFigures(figures, DEFAULT_LENDING_POLICY).verdict).toBe('approve');
	});

	it('refers within the band of the refer line, either side, and approves outside it', () => {
		const policy = policyWith(GREY_KNOBS['at-threshold']);
		for (const ratio of [57, 58, 59, 60, 61, 62, 63])
			expect(verdictFromFigures({ ...base, ratioPercent: ratio }, policy).verdict, `${ratio}`).toBe(
				'refer'
			);
		expect(verdictFromFigures({ ...base, ratioPercent: 56 }, policy).verdict).toBe('approve');
		// Over the line anyway.
		expect(verdictFromFigures({ ...base, ratioPercent: 64 }, policy).verdict).toBe('refer');
	});

	it('refers when the declared and verified incomes differ by more than the tolerance, and not otherwise', () => {
		const policy = policyWith(GREY_KNOBS.conflicting);
		const at = (declared: number) =>
			verdictFromFigures({ ...base, declaredIncome: declared, verifiedIncome: 2000 }, policy)
				.verdict;
		expect(at(2300)).toBe('approve');
		expect(at(2600)).toBe('refer');
		expect(at(1500)).toBe('refer');
	});

	it('refers when the file verifies no income, and a decline still declines', () => {
		const policy = policyWith(GREY_KNOBS.missing);
		expect(verdictFromFigures({ ...base, incomeVerified: false }, policy).verdict).toBe('refer');
		expect(
			verdictFromFigures({ ...base, scoreBand: 'poor', incomeVerified: false }, policy).verdict
		).toBe('decline');
	});
});

describe('the grey applications', () => {
	const pop = population(7, { size: 600 });
	const plain = lendingBook(pop);
	const grey = lendingBook(pop, { greyZone: true });

	it('leave a book with no greyZone as it was, and give a grey one shaped approvals only', () => {
		expect(lendingBook(pop, {}).book).toEqual(plain.book);
		const shaped = grey.rows.filter((row) => row.shape !== undefined);
		expect(shaped.length).toBeGreaterThan(3);
		for (const row of shaped) {
			const before = plain.rows.find((each) => each.id === row.id)!;
			expect(before.verdict.verdict, row.id).toBe('approve');
			expect(row.verdict.verdict, row.id).toBe('refer');
		}
		// Every item that was not shaped is exactly as it was.
		for (const row of grey.rows.filter((each) => each.shape === undefined))
			expect(row).toEqual(plain.rows.find((each) => each.id === row.id));
		// All three shapes appear on a book this size.
		expect(new Set(shaped.map((row) => row.shape))).toEqual(
			new Set(['at-threshold', 'conflicting', 'missing'])
		);
	});

	it('size an at-threshold application to the band, whatever the term and the disposable income', () => {
		const bureau = pop.customers[0]!.bureau;
		for (const nudge of [0, 1, 2, 3, 4, 17, 33]) {
			const shaped = greyApplication(
				'at-threshold',
				{
					amount: 5000,
					termMonths: 36,
					purpose: 'a car',
					declaredMonthlyIncome: 2000,
					declaredMonthlyOutgoings: 900
				},
				bureau,
				nudge
			);
			const ratio = Math.floor(
				((shaped.amount * (1 + (0.079 * 36) / 12)) /
					36 /
					Math.max(1, bureau.affordability.disposable)) *
					100
			);
			expect(Math.abs(ratio - 60), `nudge ${nudge}: ${ratio}`).toBeLessThanOrEqual(4);
		}
	});

	it('put the policy for a shaped item on its case file, and its answer in truth', () => {
		const clause = {
			'at-threshold': /within 3 points of 60% the arithmetic does not decide: refer/,
			conflicting: /differ by more than 15%, do not decide on either: refer/,
			missing: /cannot verify the income, do not decide on the declared figure: refer/
		} as const;
		for (const shape of ['at-threshold', 'conflicting', 'missing'] as const) {
			const item = grey.book.items.find(
				(each) => (each.payload as ApplicationItemPayload).shape === shape
			)!;
			const made = lendingCaseFromItem(() => 0.5, item);
			const policy = made.revealed.find((record) => record.id === 'policy')!.fields[
				'text'
			] as string;
			expect(policy, shape).toMatch(clause[shape]);
			expect(made.truth.facts?.['verdict'], shape).toBe('should-refer');
			expect(made.truth.facts?.['greyShape'], shape).toBe(`grey-${shape}`);
		}
		// A plain item states no grey clause.
		const plainItem = plain.book.items[0]!;
		const plainPolicy = lendingCaseFromItem(() => 0.5, plainItem).revealed.find(
			(record) => record.id === 'policy'
		)!.fields['text'] as string;
		expect(plainPolicy).not.toMatch(
			/arithmetic does not decide|do not decide on either|cannot verify the income/
		);
	});

	it('hide a thin file income from the worksheet and the bureau record', () => {
		const item = grey.book.items.find(
			(each) => (each.payload as ApplicationItemPayload).shape === 'missing'
		)!;
		const made = lendingCaseFromItem(() => 0.5, item);
		const worksheet = made.hidden!.find((record) => record.id === 'affordability-worksheet')!;
		expect(worksheet.fields['verified_monthly_income']).toBe('not on file');
		const bureau = made.hidden!.find((record) => record.id === 'bureau')!;
		expect(Object.keys(bureau.fields)).not.toContain('monthly_income');
		expect(Object.keys(bureau.fields)).not.toContain('disposable');
	});
});

describe('the grey book through the configurations', { timeout: 300_000 }, () => {
	const packs = [fsBankPack, fsLendingPack];
	const plans = { planFor, adversaryPlanFor };
	const FIXED = { now: () => '2026-10-09T09:00:00.000Z', newId: () => 'report-1' };

	it('is followed by the rules-only path and the scripted-optimal bot, which read the rule they are shown', async () => {
		const source = lendingBookCampaign({ size: 1500 }) as { source: Record<string, unknown> };
		source.source['greyZone'] = true;
		const campaign = parseCampaign(source);
		const prepared = prepareCampaign(campaign, { packs });
		const shaped = (prepared.book?.items ?? []).filter(
			(item) => (item.payload as ApplicationItemPayload).shape !== undefined
		);
		expect(shaped.length).toBeGreaterThan(2);
		const report = await runCampaign(campaign, { packs, plans, ...FIXED });
		expect(report.cells.every((cell) => cell.error === undefined)).toBe(true);
		const gate = (id: string) => report.gates.find((each) => each.id === id);
		expect(gate('rules-only-agrees-with-the-rule')?.passed).toBe(true);
		expect(gate('the-bots-agree-with-the-rule')?.passed).toBe(true);
	});
});
