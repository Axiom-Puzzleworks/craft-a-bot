import type { EngineEvent } from '@craftabot/core';
import { parseCampaign, runCampaign } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { describe, expect, it } from 'vitest';
import { lendingBookCampaign } from './campaign.js';
import fsLendingPack, {
	DECISION_MATCHES_RULES_ID,
	LENDING_DECISION_BY_COHORT_ERROR_MODEL_ID,
	LENDING_DECISION_ERROR_MODEL_ID,
	LENDING_DECISION_NEAR_THRESHOLD_ERROR_MODEL_ID,
	LENDING_DECISION_WHEN_STEERED_ERROR_MODEL_ID
} from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The fallible tier on the lending book** (WP115, `103-FALLIBLE-ACTORS.md`
 * §5): the loan book through the journey with the bot everywhere, its brain
 * the fallible tier over `fs-lending/error/decision`. Every planted fault is a
 * `decision.fault` written right after the `decision` it corrupts; the rule
 * agreement the scripted-optimal bot scores at 100% now falls where the
 * faults were planted — the first actor on this desk that can be wrong.
 */
const packs = [fsBankPack, fsLendingPack];
const plans = { planFor, adversaryPlanFor };
const FIXED = { now: () => '2026-09-29T09:00:00.000Z', newId: () => 'report-1' };

function campaignWith(brain: Record<string, unknown>) {
	const base = lendingBookCampaign({ size: 400, configurations: ['bot-everywhere'] }) as Record<
		string,
		unknown
	>;
	return parseCampaign({ ...base, brains: [brain] });
}

describe('the fallible tier on the lending book (WP115)', { timeout: 600_000 }, () => {
	it('plants its faults on the decision, each said on the trace beside the decision it corrupts', async () => {
		const faults: Array<{ fault: EngineEvent; before: EngineEvent | undefined }> = [];
		const report = await runCampaign(
			campaignWith({
				id: 'fallible',
				tier: 'fallible',
				errorModel: LENDING_DECISION_ERROR_MODEL_ID
			}),
			{
				packs,
				plans,
				...FIXED,
				onWorkflowRun: ({ agentRuns }) => {
					for (const agentRun of agentRuns) {
						agentRun.events.forEach((event, index) => {
							if (event.type === 'decision.fault')
								faults.push({ fault: event, before: agentRun.events[index - 1] });
						});
					}
				}
			}
		);
		expect(report.cells.every((cell) => cell.error === undefined)).toBe(true);
		expect(faults.length).toBeGreaterThan(0);
		for (const { fault, before } of faults) {
			expect(before?.type).toBe('decision');
			const payload = fault.payload as {
				action: string;
				field: string;
				chose: string;
				planted: true;
			};
			expect(payload).toMatchObject({
				field: 'outcome',
				planted: true,
				errorModel: LENDING_DECISION_ERROR_MODEL_ID
			});
			expect(payload.action).toMatch(/decide$/);
			const call = (before?.payload as { call: { arguments: { outcome: string } } }).call;
			expect(call.arguments.outcome).toBe(payload.chose);
		}
		// The optimal bot agrees with the rule on every decided case; the fallible one does not.
		const decided = report.cells.filter(
			(cell) => cell.labels[DECISION_MATCHES_RULES_ID] !== undefined
		);
		const disagree = decided.filter((cell) => cell.labels[DECISION_MATCHES_RULES_ID] !== 'agree');
		expect(disagree.length).toBeGreaterThan(0);

		const optimal = await runCampaign(campaignWith({ id: 'optimal', tier: 'scripted-optimal' }), {
			packs,
			plans,
			...FIXED
		});
		expect(
			optimal.cells
				.filter((cell) => cell.labels[DECISION_MATCHES_RULES_ID] !== undefined)
				.every((cell) => cell.labels[DECISION_MATCHES_RULES_ID] === 'agree')
		).toBe(true);
	});
});

/**
 * **Errors shaped like a model's on the lending book** (WP170, `112-REAL-ENOUGH-PLAN.md`
 * §5): the same decision, wrong at a rate that depends on the applicant's age band, on
 * how near the rule's line the case sits, or on what the applicant pressed for — and a
 * book case carries its own truth, so the fallible tier can know which case it has.
 */
describe('shaped errors on the lending book (WP170)', { timeout: 600_000 }, () => {
	const edge = new Set(['18-24', '65-74', '75+']);
	const middle = new Set(['35-44', '45-54']);

	async function wrongByBand(errorModel: string) {
		const report = await runCampaign(
			(() => {
				const base = lendingBookCampaign({
					size: 12_000,
					configurations: ['bot-everywhere']
				}) as Record<string, unknown>;
				return parseCampaign({
					...base,
					brains: [{ id: 'fallible', tier: 'fallible', errorModel }]
				});
			})(),
			{ packs, plans, ...FIXED }
		);
		const rate = (bands: Set<string>) => {
			const cells = report.cells.filter(
				(cell) => cell.cohort?.['ageBand'] !== undefined && bands.has(cell.cohort['ageBand'])
			);
			const decided = cells.filter((cell) => cell.labels[DECISION_MATCHES_RULES_ID] !== undefined);
			const wrong = decided.filter((cell) => cell.labels[DECISION_MATCHES_RULES_ID] !== 'agree');
			return { wrong: wrong.length, of: decided.length, rate: wrong.length / decided.length };
		};
		return { report, edge: rate(edge), middle: rate(middle) };
	}

	it('the cohort model errs more at the edges of the age range than in the middle; the uniform model does not', async () => {
		const skewed = await wrongByBand(LENDING_DECISION_BY_COHORT_ERROR_MODEL_ID);
		expect(skewed.edge.of).toBeGreaterThan(90);
		expect(skewed.middle.of).toBeGreaterThan(90);
		expect(skewed.edge.rate).toBeGreaterThan(skewed.middle.rate + 0.04);
		const uniform = await wrongByBand(LENDING_DECISION_ERROR_MODEL_ID);
		expect(Math.abs(uniform.edge.rate - uniform.middle.rate)).toBeLessThan(0.05);
	});

	it('every shaped model resolves against the installed packs', async () => {
		const { resolveErrorModel } = await import('@craftabot/evals');
		const { createPackRegistry } = await import('@craftabot/core');
		const registry = createPackRegistry();
		registry.registerPack(starterPack);
		for (const pack of packs) registry.registerPack(pack);
		for (const id of [
			LENDING_DECISION_BY_COHORT_ERROR_MODEL_ID,
			LENDING_DECISION_NEAR_THRESHOLD_ERROR_MODEL_ID,
			LENDING_DECISION_WHEN_STEERED_ERROR_MODEL_ID
		]) {
			const [fault] = resolveErrorModel(registry, id);
			expect(fault?.shape, id).toBeDefined();
			expect(fault?.rate).toBe(0.1);
		}
		const [cohort] = resolveErrorModel(registry, LENDING_DECISION_BY_COHORT_ERROR_MODEL_ID);
		expect(cohort?.shape?.kind === 'cohort' && Object.keys(cohort.shape.rates)).toEqual([
			'18-24',
			'25-34',
			'35-44',
			'45-54',
			'55-64',
			'65-74',
			'75+'
		]);
	});
});
