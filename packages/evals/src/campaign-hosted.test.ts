import { describe, expect, it } from 'vitest';
import geapPack, { evalFixtures } from '@craftabot/pack-geap';
import workshopPack from '@craftabot/pack-workshop';
import { injectionBaseline } from './baseline-campaign.js';
import { runCampaign, type Campaign } from './campaign.js';

/**
 * A hosted evaluator in a campaign (WP51, `39-…` §4.3): live only under a
 * `budget`, with a battery and a config; counted and capped as spend; a real
 * `evaluator-pass-rate` gate over it; offline — inconclusive, out of the
 * gate's denominator — without any of the three.
 */

const TOKEN = 'ya29.campaign-test-token';

function small(budget?: Campaign['budget']): Campaign {
	const base = injectionBaseline([1]);
	return {
		...base,
		scenarios: base.scenarios.slice(0, 1),
		guards: base.guards.slice(0, 1),
		brains: base.brains.slice(0, 1),
		evaluators: [
			{ id: 'geap/eval/safety', config: { projectId: 'proj-1', location: 'europe-west2' } }
		],
		gates: [
			{
				id: 'cloud-safe',
				require: { kind: 'evaluator-pass-rate', evaluatorId: 'geap/eval/safety', atLeast: 1 }
			}
		],
		...(budget ? { budget } : {})
	};
}

function answering(seen: { calls: number }) {
	return (async () => {
		seen.calls += 1;
		return new Response(JSON.stringify(evalFixtures['safety-safe']), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}) as typeof globalThis.fetch;
}

const packs = [workshopPack, geapPack];

describe('a campaign with geap/eval/safety', () => {
	it('under a budget, with the battery, scores every cell live, counts the calls and passes the gate', async () => {
		const seen = { calls: 0 };
		const report = await runCampaign(small({ maxLiveCells: 1, maxLiveEvaluations: 4 }), {
			packs,
			credentials: (id) => (id === 'geap' ? TOKEN : undefined),
			fetch: answering(seen)
		});
		expect(report.cells).toHaveLength(1);
		expect(seen.calls).toBe(1);
		expect(report.budget.liveEvaluations).toBe(1);
		expect(report.cells[0]?.evaluations['geap/eval/safety']).toBe('pass');
		expect(report.gates[0]).toMatchObject({ id: 'cloud-safe', passed: true, observed: 1 });
		expect(JSON.stringify(report)).not.toContain(TOKEN);
	});

	it('runs offline without a budget, without the battery, or under egress none — and never calls out', async () => {
		const seen = { calls: 0 };
		const noBudget = await runCampaign(small(), {
			packs,
			credentials: () => TOKEN,
			fetch: answering(seen)
		});
		expect(noBudget.cells[0]?.evaluations['geap/eval/safety']).toBe('inconclusive');
		expect(noBudget.budget.liveEvaluations).toBe(0);

		const noBattery = await runCampaign(small({ maxLiveCells: 1 }), {
			packs,
			fetch: answering(seen)
		});
		expect(noBattery.cells[0]?.evaluations['geap/eval/safety']).toBe('inconclusive');

		const noNetwork = await runCampaign(small({ maxLiveCells: 1 }), {
			packs,
			credentials: () => TOKEN,
			fetch: answering(seen),
			egress: 'none'
		});
		expect(noNetwork.cells[0]?.evaluations['geap/eval/safety']).toBe('inconclusive');
		expect(seen.calls).toBe(0);
	});

	it('refuses before the first cell when the live evaluations would exceed the cap', async () => {
		await expect(
			runCampaign(small({ maxLiveCells: 1, maxLiveEvaluations: 0 }), {
				packs,
				credentials: () => TOKEN,
				fetch: answering({ calls: 0 })
			})
		).rejects.toThrow(/budget\.maxLiveEvaluations/);
	});
});
