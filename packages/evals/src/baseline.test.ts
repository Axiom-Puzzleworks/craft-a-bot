import { describe, expect, it } from 'vitest';
import { compareToBaseline } from './baseline.js';
import { renderScorecard } from './scorecard.js';
import { EVAL_REPORT_SCHEMA_VERSION, type EvalReport, type EvalSummary } from './report.js';

/**
 * The gate, and the sheet a reviewer actually reads.
 *
 * The property that matters most here is the one that says **no**: two reports
 * taken with different instruments must not be compared. A 20-seed report
 * against a 5-seed baseline, or a matrix run at different noise rates, produces
 * differences that look exactly like real regressions — and a gate that cries
 * wolf is a gate everyone learns to ignore.
 */

const summary = (over: Partial<EvalSummary> = {}): EvalSummary => ({
	goalCardId: 'starter/say-hello',
	brainId: 'scripted-noisy',
	cells: 20,
	successRate: 0.8,
	medianTicks: 5,
	medianLoopStreak: 1,
	meanWastedTickRatio: 0.1,
	namingMisses: 4,
	meanTokensIn: 500,
	meanTokensOut: 80,
	...over
});

const report = (
	summaries: EvalSummary[],
	over: Partial<EvalReport['matrix']> = {}
): EvalReport => ({
	schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
	id: 'r1',
	createdAt: '2026-08-15T12:00:00.000Z',
	matrix: {
		goalCardIds: ['starter/say-hello'],
		brains: [{ id: 'scripted-noisy', tier: 'scripted-noisy' }],
		configIds: ['default'],
		seeds: Array.from({ length: 20 }, (_, i) => i + 1),
		noise: { misname: 0.12, wastedMove: 0.12, prematureCelebrate: 0.04 },
		...over
	},
	cells: [],
	summaries
});

describe('refusing to compare', () => {
	it('will not diff across a different number of seeds', () => {
		const result = compareToBaseline(
			report([summary()]),
			report([summary()], { seeds: [1, 2, 3, 4, 5] })
		);
		expect(result.comparable).toBe(false);
		expect(result).toHaveProperty('reason', expect.stringContaining('5 seeds'));
	});

	it('will not diff across different noise rates', () => {
		// The noise *is* the instrument. A report taken at other settings is
		// measuring a different bot, and the difference would read as a change in
		// the world.
		const result = compareToBaseline(
			report([summary()]),
			report([summary()], {
				noise: { misname: 0.3, wastedMove: 0.12, prematureCelebrate: 0.04 }
			})
		);
		expect(result.comparable).toBe(false);
		expect(result).toHaveProperty('reason', expect.stringContaining('instrument changed'));
	});

	it('will not diff across schema versions', () => {
		const old = { ...report([summary()]), schemaVersion: 0 as unknown as 1 };
		const result = compareToBaseline(report([summary()]), old);
		expect(result.comparable).toBe(false);
	});
});

describe('what moved', () => {
	const diff = (now: Partial<EvalSummary>, before: Partial<EvalSummary> = {}) =>
		compareToBaseline(report([summary(now)]), report([summary(before)]));

	it('says nothing when nothing moved', () => {
		const result = diff({});
		expect(result).toMatchObject({ comparable: true, regressions: [], improvements: [] });
	});

	it('ignores movement inside tolerance', () => {
		// Zero tolerance would fire on a rounding difference in a mean and teach
		// everyone to ignore the gate.
		const result = diff({ successRate: 0.78 });
		expect(result).toHaveProperty('regressions', []);
	});

	it('calls a drop in success a regression and a rise an improvement', () => {
		expect(diff({ successRate: 0.5 })).toHaveProperty('regressions', [
			expect.objectContaining({ metric: 'successRate', delta: expect.closeTo(-0.3) })
		]);
		expect(diff({ successRate: 1 })).toHaveProperty('improvements', [
			expect.objectContaining({ metric: 'successRate' })
		]);
	});

	it('knows that more ticks, more waste and more looping are all worse', () => {
		// Three of the four metrics are worse when higher and one is better. Get
		// the exception wrong and every improvement reports as a regression.
		const result = diff({ medianTicks: 12, meanWastedTickRatio: 0.4, medianLoopStreak: 6 });
		expect(result).toHaveProperty('comparable', true);
		if (!result.comparable) return;
		expect(result.regressions.map((m) => m.metric).sort()).toEqual([
			'loopStreak',
			'medianTicks',
			'wastedTickRatio'
		]);
		expect(result.improvements).toEqual([]);
	});

	it('notices squares appearing and disappearing', () => {
		const now = report([summary(), summary({ goalCardId: 'starter/snack' })]);
		const before = report([summary(), summary({ goalCardId: 'starter/tidy-the-blocks' })]);
		const result = compareToBaseline(now, before);

		expect(result).toHaveProperty('added', ['starter/snack × scripted-noisy']);
		expect(result).toHaveProperty('removed', ['starter/tidy-the-blocks × scripted-noisy']);
	});
});

describe('the scorecard', () => {
	it('draws the grid, the detail and the diff', () => {
		const markdown = renderScorecard(
			report([summary()]),
			compareToBaseline(report([summary({ successRate: 0.4 })]), report([summary()]))
		);

		expect(markdown).toContain('# Eval scorecard');
		expect(markdown).toContain('## Success rate');
		expect(markdown).toContain('`starter/say-hello`');
		expect(markdown).toContain('80%');
		expect(markdown).toContain('### Regressions');
	});

	it('says when a comparison was refused rather than printing nothing', () => {
		const markdown = renderScorecard(report([summary()]), {
			comparable: false,
			reason: 'the instrument changed'
		});
		expect(markdown).toContain('Not compared — the instrument changed.');
	});

	it('puts cells that never ran at the top, not in a footnote', () => {
		// A matrix with missing squares is not a matrix with good results, however
		// green the rest of the sheet looks.
		const withFailure: EvalReport = {
			...report([summary()]),
			cells: [
				{
					goalCardId: 'starter/say-hello',
					brainId: 'scripted-noisy',
					tier: 'scripted-noisy',
					configId: 'default',
					seed: 1,
					error: 'no scripted solution for starter/nope',
					metrics: {
						ticksUsed: 0,
						tokensIn: 0,
						tokensOut: 0,
						loop: { longestStreak: 0, repeatedFailures: 0 },
						wastedTickRatio: 0,
						namingMisses: 0,
						namingAmbiguities: 0,
						guardrailTrips: {},
						approvalsRequested: 0,
						approvalsDenied: 0
					}
				}
			]
		};
		const markdown = renderScorecard(withFailure);
		expect(markdown).toContain('1 cells did not run');
		expect(markdown.indexOf('did not run')).toBeLessThan(markdown.indexOf('## Success rate'));
	});
});
