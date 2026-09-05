import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
	compareToBaseline,
	EXPERT_MATRIX,
	matrixSize,
	parseEvalReport,
	renderScorecard,
	runMatrix,
	SCRIPTED_MATRIX,
	type BaselineComparison,
	type EvalReport,
	type MatrixSpec
} from '@craftabot/evals';

/**
 * `craftabot campaign --matrix <name>` (WP56 stage B, `41-…` §6.13 G37): the
 * one thing `@craftabot/evals`' own CLI did that a campaign file does not —
 * an ad-hoc matrix (cards × brains × seeds, no gates) with a scorecard and a
 * baseline diff — moved under the harness, so the repo has one headless host
 * rather than two. The logic is the evals CLI's, verbatim in behaviour:
 *
 * **Reports the regression; does not fail the build.** `13-…` §8 is explicit:
 * "regressions fail the report, not the build". A scripted regression is
 * something we changed and want to look at, and a red build that a reviewer
 * cannot distinguish from a broken test is how a signal gets routed to the
 * bin. `strict` is there for a job that does want a hard gate.
 *
 * **`record` promotes the run just made to the baseline.** Deliberately a
 * separate, explicit act: a harness that quietly re-baselined would make
 * every regression disappear the moment it was observed.
 */
export const MATRICES: Record<string, MatrixSpec> = {
	scripted: SCRIPTED_MATRIX,
	expert: EXPERT_MATRIX
};

export interface MatrixOptions {
	/** Which matrix: a name from `MATRICES`, or a spec of your own (tests). */
	matrix: string | MatrixSpec;
	/** Where the report, the scorecard and the baseline live. */
	out: string;
	record?: boolean;
	strict?: boolean;
	onCell?: (index: number, total: number) => void;
}

export interface MatrixResult {
	name: string;
	report: EvalReport;
	comparison: BaselineComparison | undefined;
	reportFile: string;
	scorecardFile: string;
	baselineFile: string;
	recorded: boolean;
	/** 0, or 1 when `strict` and the comparison found regressions. */
	exitCode: number;
	/** What the evals CLI used to print, line by line. */
	lines: string[];
}

export async function runMatrixCommand(options: MatrixOptions): Promise<MatrixResult> {
	const name = typeof options.matrix === 'string' ? options.matrix : 'custom';
	const spec = typeof options.matrix === 'string' ? MATRICES[options.matrix] : options.matrix;
	if (spec === undefined) {
		throw new Error(
			`campaign --matrix wants one of ${Object.keys(MATRICES).join(', ')}, got "${name}"`
		);
	}
	const total = matrixSize(spec);
	const report = await runMatrix(spec, {
		onCell: (_cell, index) => options.onCell?.(index, total)
	});

	await mkdir(options.out, { recursive: true });
	const baselineFile = resolve(options.out, `${name}.baseline.json`);
	const reportFile = resolve(options.out, `${name}.report.json`);
	const scorecardFile = resolve(options.out, `${name}.scorecard.md`);

	const baseline = await readBaseline(baselineFile);
	const comparison = baseline ? compareToBaseline(report, baseline) : undefined;

	await writeFile(reportFile, `${JSON.stringify(report, null, '\t')}\n`);
	await writeFile(scorecardFile, renderScorecard(report, comparison));

	const lines: string[] = [];
	if (options.record) {
		/*
		 * **Summaries only.** A baseline is "what the numbers were", and
		 * `compareToBaseline` reads nothing but the summaries and the matrix. The
		 * per-cell detail is most of the file, it changes on every run, and it
		 * would land in git history forever — where it would make the one file a
		 * reviewer actually needs to read impossible to read. The full record sits
		 * beside it in `*.report.json`, which is not committed.
		 */
		const stored: EvalReport = { ...report, cells: [] };
		await writeFile(baselineFile, `${JSON.stringify(stored, null, '\t')}\n`);
		lines.push(`recorded ${baselineFile} as the new baseline`);
	}
	lines.push(`scorecard written to ${scorecardFile}`);

	const { exitCode, summary } = summarise(comparison, options.strict ?? false);
	lines.push(...summary);

	return {
		name,
		report,
		comparison,
		reportFile,
		scorecardFile,
		baselineFile,
		recorded: options.record ?? false,
		exitCode,
		lines
	};
}

async function readBaseline(path: string): Promise<EvalReport | undefined> {
	try {
		return parseEvalReport(JSON.parse(await readFile(path, 'utf8')));
	} catch (error) {
		// A missing baseline is the normal first run. A *corrupt* one is not, and
		// silently treating it as missing would let a bad file hide every
		// regression until somebody opened it.
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
		// The cause is kept: a zod parse failure says exactly which field of the
		// baseline is wrong, and that is the whole of the useful information.
		throw new Error(`could not read the baseline at ${path}`, { cause: error });
	}
}

function summarise(
	comparison: BaselineComparison | undefined,
	strict: boolean
): { exitCode: number; summary: string[] } {
	if (!comparison) {
		return { exitCode: 0, summary: ['no baseline yet — run with --record to store this one'] };
	}
	if (!comparison.comparable) {
		return { exitCode: 0, summary: [`not compared — ${comparison.reason}`] };
	}
	if (comparison.regressions.length === 0) {
		return { exitCode: 0, summary: ['no regressions against the baseline'] };
	}
	const summary = [`${comparison.regressions.length} regressions against the baseline`];
	for (const move of comparison.regressions) {
		summary.push(
			`  ${move.goalCardId} × ${move.brainId}: ${move.metric} ` +
				`${move.baseline.toFixed(2)} → ${move.current.toFixed(2)}`
		);
	}
	return { exitCode: strict ? 1 : 0, summary };
}
