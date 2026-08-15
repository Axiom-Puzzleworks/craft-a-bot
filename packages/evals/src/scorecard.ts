import type { BaselineComparison } from './baseline.js';
import type { EvalReport, EvalSummary } from './report.js';

/**
 * **The scorecard** (`13-…` §8: "a markdown scorecard in CI artefacts").
 *
 * Markdown rather than a chart, and a table rather than a heat map, because the
 * consumer is a CI artefact and a pull-request comment. `17-…` §4.4's grid is
 * the *screen*; this is the same numbers where a reviewer will actually meet
 * them, and `04-…`'s dataviz rule that a table is always available applies here
 * with nothing else alongside it.
 *
 * Every number in it is a summary already computed in `report.ts`. Nothing is
 * calculated here — a renderer that did arithmetic would be a second place for
 * "median" to mean something slightly different.
 */

export function renderScorecard(report: EvalReport, comparison?: BaselineComparison): string {
	const lines: string[] = [];

	lines.push('# Eval scorecard');
	lines.push('');
	lines.push(`Report \`${report.id}\` · ${report.createdAt}`);
	lines.push('');
	lines.push(
		`**Matrix:** ${report.matrix.goalCardIds.length} cards × ${report.matrix.brains.length} brains × ` +
			`${report.matrix.configIds.length} configs × ${report.matrix.seeds.length} seeds = ` +
			`**${report.cells.length} cells**`
	);
	lines.push('');
	lines.push(
		`**Noise:** misname ${pct(report.matrix.noise.misname)}, wasted move ` +
			`${pct(report.matrix.noise.wastedMove)}, premature celebrate ` +
			`${pct(report.matrix.noise.prematureCelebrate)}`
	);

	const failed = report.cells.filter((cell) => cell.error !== undefined);
	if (failed.length > 0) {
		lines.push('');
		// Loudly and near the top: a matrix with cells that never ran is not a
		// matrix with good results, however green the rest of it looks.
		lines.push(`> ⚠️ **${failed.length} cells did not run.** First: \`${failed[0]?.error}\``);
	}

	lines.push('');
	lines.push(...successGrid(report));
	lines.push('');
	lines.push(...detailTable(report));

	if (comparison) {
		lines.push('');
		lines.push(...baselineSection(comparison));
	}

	return lines.join('\n') + '\n';
}

/** Rows are cards, columns are brains — the shape `17-…` §4.4 draws. */
function successGrid(report: EvalReport): string[] {
	const brains = report.matrix.brains.map((brain) => brain.id);
	const bySquare = new Map(
		report.summaries.map((s) => [`${s.goalCardId} ${s.brainId}`, s] as const)
	);

	const lines = ['## Success rate', ''];
	lines.push(`| Goal card | ${brains.join(' | ')} |`);
	lines.push(`|---|${brains.map(() => '---').join('|')}|`);

	for (const goalCardId of report.matrix.goalCardIds) {
		const cells = brains.map((brainId) => {
			const summary = bySquare.get(`${goalCardId} ${brainId}`);
			return summary ? pct(summary.successRate) : '—';
		});
		lines.push(`| \`${goalCardId}\` | ${cells.join(' | ')} |`);
	}
	return lines;
}

function detailTable(report: EvalReport): string[] {
	const lines = ['## Per square', ''];
	lines.push(
		'| Goal card | Brain | Runs | Success | Median ticks | Wasted | Loop | Naming misses | Tokens in/out |'
	);
	lines.push('|---|---|---|---|---|---|---|---|---|');

	for (const summary of [...report.summaries].sort(sortSquares)) {
		lines.push(
			`| \`${summary.goalCardId}\` | ${summary.brainId} | ${summary.cells} | ` +
				`${pct(summary.successRate)} | ${round(summary.medianTicks)} | ` +
				`${pct(summary.meanWastedTickRatio)} | ${round(summary.medianLoopStreak)} | ` +
				`${summary.namingMisses} | ${round(summary.meanTokensIn)}/${round(summary.meanTokensOut)} |`
		);
	}
	return lines;
}

function baselineSection(comparison: BaselineComparison): string[] {
	const lines = ['## Against the baseline', ''];

	if (!comparison.comparable) {
		lines.push(`Not compared — ${comparison.reason}.`);
		return lines;
	}

	if (comparison.regressions.length === 0 && comparison.improvements.length === 0) {
		lines.push('No movement outside tolerance.');
	}

	for (const [heading, movements] of [
		['Regressions', comparison.regressions],
		['Improvements', comparison.improvements]
	] as const) {
		if (movements.length === 0) continue;
		lines.push(`### ${heading}`, '');
		lines.push('| Goal card | Brain | Metric | Baseline | Now | Δ |');
		lines.push('|---|---|---|---|---|---|');
		for (const move of movements) {
			lines.push(
				`| \`${move.goalCardId}\` | ${move.brainId} | ${move.metric} | ` +
					`${round(move.baseline)} | ${round(move.current)} | ${signed(move.delta)} |`
			);
		}
		lines.push('');
	}

	for (const [heading, squares] of [
		['New squares', comparison.added],
		['Squares no longer run', comparison.removed]
	] as const) {
		if (squares.length === 0) continue;
		lines.push(`### ${heading}`, '', ...squares.map((square) => `- ${square}`), '');
	}

	return lines;
}

const sortSquares = (a: EvalSummary, b: EvalSummary) =>
	a.goalCardId === b.goalCardId
		? a.brainId.localeCompare(b.brainId)
		: a.goalCardId.localeCompare(b.goalCardId);

const pct = (value: number) => `${Math.round(value * 100)}%`;
const round = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
const signed = (value: number) => (value > 0 ? `+${round(value)}` : round(value));
