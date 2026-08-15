import { describe, expect, it } from 'vitest';
import { parseEvalReport, summarise, type EvalCell } from './report.js';
import { matrixSize, runMatrix, type MatrixSpec } from './runner.js';

/**
 * The runner and the record it produces.
 *
 * Two properties carry the weight. **A report must parse** — it is stored, and
 * a baseline nobody can read is a baseline nobody can trust. And **a failing
 * cell must survive into the report**, because a runner that dropped its
 * failures would publish a smaller, healthier matrix than the one that ran, and
 * the missing squares would look like a configuration choice.
 */

const BASE: MatrixSpec = {
	goalCardIds: ['starter/say-hello'],
	brains: [
		{ id: 'scripted-optimal', tier: 'scripted-optimal' },
		{ id: 'scripted-noisy', tier: 'scripted-noisy' }
	],
	configs: [{ id: 'default' }],
	seeds: [1, 2, 3]
};

const fixed = { now: () => '2026-08-15T12:00:00.000Z', newId: () => 'report-1' };

describe('the matrix', () => {
	it('knows how big it is before it runs', () => {
		expect(matrixSize(BASE)).toBe(6);
		expect(matrixSize({ ...BASE, seeds: [1, 2, 3, 4, 5] })).toBe(10);
	});

	it('runs every cell and produces a report that parses', async () => {
		const report = await runMatrix(BASE, fixed);

		expect(report.cells).toHaveLength(6);
		expect(() => parseEvalReport(report)).not.toThrow();
		expect(report.createdAt).toBe('2026-08-15T12:00:00.000Z');
	});

	it('records the instrument alongside the measurement', async () => {
		// Baselines are only comparable against the noise that produced them, so
		// a report that did not carry its own rates could be diffed against one
		// run at different settings and call the difference a regression.
		const report = await runMatrix({ ...BASE, noise: { misname: 0.5 } }, fixed);
		expect(report.matrix.noise.misname).toBe(0.5);
		expect(report.matrix.noise.wastedMove).toBe(0.12);
		expect(report.matrix.seeds).toEqual([1, 2, 3]);
	});

	it('is reproducible — the same matrix twice is the same numbers', async () => {
		const a = await runMatrix(BASE, fixed);
		const b = await runMatrix(BASE, fixed);
		expect(b.cells).toEqual(a.cells);
	});

	it('joins every cell back to the run behind it', async () => {
		// `17-…` §4.4: "every number links to the runs behind it (no
		// unexplainable aggregates)".
		const report = await runMatrix(BASE, fixed);
		for (const cell of report.cells) expect(cell.runId).toBeDefined();
	});

	it('fits the tools a plan needs, or the cell measures the wrong bot', async () => {
		/*
		 * Found by reading a scorecard, not by a test: Sums showed 50 % wasted
		 * ticks on the *optimal* plan, which the solvability suite proves wastes
		 * nothing. The cell had run with no Tool Belt, so the calculator call was
		 * a turn the bot could not take — and it still scored 100 % success,
		 * because the plan says "391" in words and the card only asks that Teddy
		 * be told. Green, wrong, and measuring nothing about tool use.
		 */
		const report = await runMatrix(
			{
				...BASE,
				goalCardIds: ['starter/sums-for-teddy'],
				brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }],
				seeds: [1]
			},
			fixed
		);

		expect(report.cells[0]?.metrics.wastedTickRatio).toBe(0);
		expect(report.cells[0]?.metrics.outcome).toBe('SUCCESS');
	});

	it('reports progress as it goes', async () => {
		const seen: number[] = [];
		await runMatrix(BASE, { ...fixed, onCell: (_cell, index, total) => seen.push(total - index) });
		expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
	});
});

describe('when a cell cannot run', () => {
	it('keeps the failure in the report rather than dropping the cell', async () => {
		const report = await runMatrix({ ...BASE, goalCardIds: ['starter/not-a-card'] }, fixed);

		expect(report.cells).toHaveLength(6);
		expect(report.cells[0]?.error).toMatch(/no scripted solution/);
		// A cell that never ran has no outcome — it must not read as a failed run,
		// which is a different and much less alarming thing.
		expect(report.cells[0]?.metrics.outcome).toBeUndefined();
	});

	it('refuses to file scripted numbers under a real model’s name', async () => {
		// The worst available outcome for a document whose job is to be trusted:
		// a live column quietly answered by the mock.
		const report = await runMatrix(
			{ ...BASE, brains: [{ id: 'openai/quick-thinker', tier: 'live' }] },
			fixed
		);
		expect(report.cells[0]?.error).toMatch(/live tier and no providerFor/);
	});
});

describe('summaries', () => {
	const cell = ({
		metrics,
		...over
	}: Partial<Omit<EvalCell, 'metrics'>> & {
		metrics?: Partial<EvalCell['metrics']>;
	}): EvalCell => ({
		goalCardId: 'starter/say-hello',
		brainId: 'scripted-noisy',
		tier: 'scripted-noisy',
		configId: 'default',
		seed: 1,
		...over,
		metrics: {
			outcome: 'SUCCESS',
			ticksUsed: 4,
			tokensIn: 100,
			tokensOut: 20,
			loop: { longestStreak: 1, repeatedFailures: 0 },
			wastedTickRatio: 0,
			namingMisses: 0,
			namingAmbiguities: 0,
			guardrailTrips: {},
			approvalsRequested: 0,
			approvalsDenied: 0,
			...metrics
		}
	});

	it('groups by card and brain, which is what the grid draws', () => {
		const summaries = summarise([
			cell({ seed: 1 }),
			cell({ seed: 2 }),
			cell({ seed: 1, brainId: 'scripted-optimal', tier: 'scripted-optimal' })
		]);
		expect(summaries).toHaveLength(2);
		expect(summaries.find((s) => s.brainId === 'scripted-noisy')?.cells).toBe(2);
	});

	it('takes the median of ticks, not the mean', () => {
		// One run that ended out of steps drags a mean somewhere no actual run
		// went, and "typical" is the question the grid is asking.
		const summary = summarise([
			cell({ seed: 1, metrics: { ticksUsed: 4 } }),
			cell({ seed: 2, metrics: { ticksUsed: 4 } }),
			cell({ seed: 3, metrics: { ticksUsed: 30, outcome: 'OUT_OF_STEPS' } })
		])[0];

		expect(summary?.medianTicks).toBe(4);
		expect(summary?.successRate).toBeCloseTo(2 / 3);
	});

	it('averages an even number of runs across the middle two', () => {
		const summary = summarise([
			cell({ seed: 1, metrics: { ticksUsed: 2 } }),
			cell({ seed: 2, metrics: { ticksUsed: 4 } }),
			cell({ seed: 3, metrics: { ticksUsed: 6 } }),
			cell({ seed: 4, metrics: { ticksUsed: 20 } })
		])[0];
		expect(summary?.medianTicks).toBe(5);
	});

	it('totals naming misses rather than averaging them', () => {
		// "How many times did the world fail to explain itself" is a count. A mean
		// would hide a card that misfires badly on one seed in twenty.
		const summary = summarise([
			cell({ seed: 1, metrics: { namingMisses: 3 } }),
			cell({ seed: 2, metrics: { namingMisses: 0 } })
		])[0];
		expect(summary?.namingMisses).toBe(3);
	});
});

describe('keeping a cell’s trace', () => {
	it('hands out the events and the spec when asked', async () => {
		// The Workshop's Eval Matrix drills a cell down to a single run without
		// re-executing it (`17-…` §4.4).
		const traces: { runId: string | undefined; events: number }[] = [];
		await runMatrix(
			{ ...BASE, seeds: [1] },
			{
				...fixed,
				onTrace: (cell, trace) => traces.push({ runId: cell.runId, events: trace.events.length })
			}
		);

		expect(traces).toHaveLength(2);
		expect(traces[0]?.events).toBeGreaterThan(0);
		expect(traces[0]?.runId).toBeDefined();
	});

	it('keeps nothing when not asked', async () => {
		// The default must not hold 240 traces in memory: a matrix is a summary,
		// and the events behind it are an order of magnitude more data.
		const report = await runMatrix({ ...BASE, seeds: [1] }, fixed);
		expect(report.cells.every((cell) => !('events' in cell))).toBe(true);
	});
});

describe('yielding between cells', () => {
	it('awaits the caller’s hook once per cell', async () => {
		/*
		 * The option exists because `await` alone does not yield to the browser:
		 * a scripted cell's awaits all settle on the microtask queue, so a matrix
		 * runs to completion in one turn of the event loop and freezes the tab.
		 * That is not a hypothetical — it is what the Eval Matrix screen did.
		 */
		let yields = 0;
		const report = await runMatrix(
			{ ...BASE, seeds: [1, 2] },
			{
				...fixed,
				betweenCells: () => {
					yields += 1;
					return Promise.resolve();
				}
			}
		);
		expect(yields).toBe(report.cells.length);
	});

	it('runs without one, for the CLI', async () => {
		const report = await runMatrix({ ...BASE, seeds: [1] }, fixed);
		expect(report.cells).toHaveLength(2);
	});
});

describe('cell identity', () => {
	it('gives every cell its own runId', async () => {
		/*
		 * `17-…` §4.4 requires that every number links to the runs behind it, and
		 * `EvalCell.runId` is that link. The harness numbers each run's ids from a
		 * fixed point, so without an offset every cell in the matrix carried
		 * `…000000000001` — the join key joined everything to everything, and
		 * storing two cells' traces spliced one onto the other.
		 */
		const report = await runMatrix({ ...BASE, seeds: [1, 2, 3] }, fixed);
		const ids = report.cells.map((cell) => cell.runId);

		expect(ids.every((id) => id !== undefined)).toBe(true);
		expect(new Set(ids).size).toBe(report.cells.length);
	});

	it('gives the same cell the same runId every time', async () => {
		// Reproducibility is the property the whole harness stands on: a cell must
		// be re-openable, not merely re-runnable.
		const first = await runMatrix(BASE, fixed);
		const second = await runMatrix(BASE, fixed);
		expect(second.cells.map((c) => c.runId)).toEqual(first.cells.map((c) => c.runId));
	});
});
