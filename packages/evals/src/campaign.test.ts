import { describe, expect, it } from 'vitest';
import { injectionBaseline, NEVER_SAYS_THE_CODE } from './baseline-campaign.js';
import {
	campaignCells,
	evaluateGate,
	parseCampaign,
	parseCampaignReport,
	runCampaign,
	specFor,
	type Campaign,
	type CampaignCell
} from './campaign.js';
import { renderCampaignScorecard } from './campaign-scorecard.js';

/**
 * **A campaign proves the attack, then proves the defence** (`28-…` §3.2).
 *
 * The baseline campaign over the four shipped governance scenarios is the
 * fixture: with two seeds it is 32 cells and runs in well under a second,
 * which is what lets the red run — a guard removed from a scenario that
 * expects one — be a real, repeatable failure rather than a story.
 */
const clock = () => {
	let calls = 0;
	return () => new Date(Date.UTC(2026, 8, 2, 12, 0, calls++)).toISOString();
};
const ids = () => {
	let n = 0;
	return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};
const small = () => injectionBaseline([1, 2]);

describe('the campaign file', () => {
	it('parses the baseline and lays out its cells in axis order, honouring guard.for', () => {
		const campaign = parseCampaign(small());
		const cells = campaignCells(campaign);
		// 4 scenarios × 1 build × (none + its own guard) × 2 brains × 2 seeds
		expect(cells).toHaveLength(4 * 1 * 2 * 2 * 2);
		expect(cells.map((cell) => cell.ordinal)).toEqual(cells.map((_, index) => index));
		expect(
			cells
				.filter((cell) => cell.guard.id === 'blocklist')
				.every((c) => c.scenario.id === 'warning-sign')
		).toBe(true);
	});

	it('fits the build, then the scenario, then the guard — the guard winning a socket', () => {
		const campaign = parseCampaign(small());
		const falseAlarm = campaign.scenarios.find((s) => s.id === 'false-alarm')!;
		const guard = campaign.guards.find((g) => g.id === 'least-privilege')!;
		const build = campaign.builds[0]!;

		const unguarded = specFor({ scenario: falseAlarm, build, guard: campaign.guards[0]! });
		const equipment = unguarded.bricks.filter((b) => b.slot === 'equipment');
		expect(equipment).toHaveLength(1);
		expect(equipment[0]?.config).toMatchObject({ scopes: ['forecast', 'alert'] });

		const guarded = specFor({ scenario: falseAlarm, build, guard });
		expect(guarded.bricks.filter((b) => b.slot === 'equipment')[0]?.config).toMatchObject({
			scopes: ['forecast']
		});
		expect(guarded.goalCardId).toBe('starter/false-alarm');
	});
});

describe('running the baseline', () => {
	it('proves every attack lands unguarded and every guard holds, with the goal still reachable', async () => {
		const report = await runCampaign(small(), { now: clock(), newId: ids() });
		expect(parseCampaignReport(report)).toEqual(report);

		const failed = report.gates.filter((gate) => !gate.passed);
		expect(failed.map((g) => `${g.id}: ${g.observed ?? '—'} vs ${g.required}`)).toEqual([]);
		expect(report.passed).toBe(true);
		expect(report.cells.every((cell) => cell.error === undefined)).toBe(true);
		expect(report.budget.liveCells).toBe(0);

		// The unguarded adversary really leaks, on every scenario.
		const leaks = report.cells.filter((c) => c.guard === 'none' && c.tier === 'scripted-adversary');
		expect(leaks).toHaveLength(8);
		for (const cell of leaks) {
			const card = Object.entries(cell.assertions).find(([id]) => id === cardFor(cell.scenario));
			expect(card?.[1], `${cell.scenario} should leak unguarded`).toBe(false);
		}
	});

	it('fails when a guard is removed from a scenario that expects one — the red run', async () => {
		const campaign = small();
		const policyCard = campaign.guards.find((g) => g.id === 'policy-card')!;
		policyCard.fit = [];

		const report = await runCampaign(campaign, { now: clock(), newId: ids() });
		expect(report.passed).toBe(false);
		const failed = report.gates.filter((gate) => !gate.passed).map((gate) => gate.id);
		expect(failed.sort()).toEqual(['guard-holds:keep-the-secret', 'guard-holds:party-line']);
		const gate = report.gates.find((g) => g.id === 'guard-holds:keep-the-secret')!;
		expect(gate.observed).toBe(0);
		expect(gate.cells).toBe(2);
	});

	it('is reproducible: the same file yields the same cells and gates', async () => {
		const a = await runCampaign(small(), { now: clock(), newId: ids() });
		const b = await runCampaign(small(), { now: clock(), newId: ids() });
		expect(b.cells).toEqual(a.cells);
		expect(b.gates).toEqual(a.gates);
	});

	it('renders a scorecard that leads with the verdict', async () => {
		const report = await runCampaign(small(), { now: clock(), newId: ids() });
		const text = renderCampaignScorecard(report);
		expect(text).toContain('✅ PASSED');
		expect(text).toContain('`guard-holds:false-alarm`');
		expect(text).toContain('| false-alarm | least-privilege | scripted-adversary |');
	});
});

describe('budget', () => {
	it('refuses a live brain with no budget, naming the field, before anything runs', async () => {
		const campaign = small();
		campaign.brains.push({ id: 'live-brain', tier: 'live', cartridgeId: 'openai/quick-thinker' });
		await expect(runCampaign(campaign)).rejects.toThrow(/no budget.*maxLiveCells/);
	});

	it('refuses more live cells than the budget allows, before the first call', async () => {
		const campaign = small();
		campaign.brains.push({ id: 'live-brain', tier: 'live' });
		campaign.budget = { maxLiveCells: 1 };
		await expect(runCampaign(campaign)).rejects.toThrow(/budget.maxLiveCells/);
	});

	it('records a live cell whose provider is missing as an error, never as a fake result', async () => {
		const campaign = small();
		campaign.scenarios = [campaign.scenarios[0]!];
		campaign.seeds = [1];
		campaign.brains = [{ id: 'live-brain', tier: 'live' }];
		campaign.budget = { maxLiveCells: 10 };
		campaign.gates = [
			{ id: 'any', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 } }
		];
		const report = await runCampaign(campaign);
		expect(report.cells.every((cell) => cell.error?.includes('providerFor'))).toBe(true);
	});
});

describe('gates', () => {
	const cell = (over: Partial<CampaignCell>): CampaignCell => ({
		scenario: 's',
		build: 'b',
		guard: 'g',
		brain: 'x',
		tier: 'scripted-optimal',
		seed: 1,
		outcome: 'SUCCESS',
		metrics: {
			outcome: 'SUCCESS',
			ticksUsed: 4,
			tokensIn: 10,
			tokensOut: 5,
			loop: { longestStreak: 1, repeatedFailures: 0 },
			wastedTickRatio: 0,
			namingMisses: 0,
			namingAmbiguities: 0,
			guardrailTrips: { 'a/b': 2 },
			approvalsRequested: 0,
			approvalsDenied: 0
		},
		assertions: { card: true },
		...over
	});
	const campaign: Campaign = {
		...small(),
		scenarios: [{ id: 's', goalCardId: 'starter/say-hello', tags: ['t1'], fit: [] }]
	};

	it('fails a gate that matched no cells — a rule nobody ran did not hold', () => {
		const verdict = evaluateGate(
			{
				id: 'g',
				where: { guard: 'nowhere' },
				require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 1 }
			},
			[cell({})],
			campaign
		);
		expect(verdict).toMatchObject({ passed: false, cells: 0 });
		expect(verdict.observed).toBeUndefined();
	});

	it('selects by tag, and aggregates a metric', () => {
		const cells = [
			cell({ metrics: { ...cell({}).metrics, ticksUsed: 2 } }),
			cell({ metrics: { ...cell({}).metrics, ticksUsed: 6 } })
		];
		expect(
			evaluateGate(
				{
					id: 'm',
					where: { tag: 't1' },
					require: { kind: 'metric', name: 'ticksUsed', aggregate: 'mean', atMost: 4 }
				},
				cells,
				campaign
			)
		).toMatchObject({ passed: true, observed: 4, cells: 2 });
		expect(
			evaluateGate(
				{
					id: 'm',
					where: { tag: 'other' },
					require: { kind: 'metric', name: 'guardrailTrips', aggregate: 'max', atLeast: 1 }
				},
				cells,
				campaign
			)
		).toMatchObject({ passed: false, cells: 0 });
		expect(
			evaluateGate(
				{
					id: 'm',
					require: { kind: 'metric', name: 'guardrailTrips', aggregate: 'median', atLeast: 2 }
				},
				cells,
				campaign
			)
		).toMatchObject({ passed: true, observed: 2 });
	});

	it('is inconclusive on no-regression without a baseline, and honest with one', async () => {
		const gate = { id: 'nr', require: { kind: 'no-regression' as const, tolerance: 0 } };
		expect(evaluateGate(gate, [cell({})], campaign)).toMatchObject({
			passed: true,
			inconclusive: true
		});

		const baseline = await runCampaign(small(), { now: clock(), newId: ids() });
		const same = evaluateGate(
			{ ...gate, require: { kind: 'no-regression', tolerance: 0 } },
			baseline.cells,
			small(),
			baseline
		);
		expect(same).toMatchObject({ passed: true, observed: 0 });

		const worse = baseline.cells.map((c) =>
			c.brain === 'scripted-optimal' ? { ...c, outcome: 'OUT_OF_STEPS' as const } : c
		);
		expect(evaluateGate(gate, worse, small(), baseline)).toMatchObject({
			passed: false,
			observed: 1
		});
	});

	it('the embedded leak card names the pack’s own phrase, so it cannot drift', () => {
		const when = NEVER_SAYS_THE_CODE.when;
		expect(when.kind).toBe('and');
		if (when.kind === 'and') {
			expect(when.all[1]).toMatchObject({ kind: 'argument-equals', path: 'text' });
		}
	});
});

function cardFor(scenario: string): string {
	return scenario === 'warning-sign'
		? 'campaign/never-gives-the-ball-away'
		: scenario === 'false-alarm'
			? 'campaign/never-sends-the-alert'
			: 'campaign/never-says-the-code';
}
