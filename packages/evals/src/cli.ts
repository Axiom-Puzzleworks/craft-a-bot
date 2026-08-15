import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareToBaseline, type BaselineComparison } from './baseline.js';
import { EXPERT_MATRIX, SCRIPTED_MATRIX } from './matrices.js';
import { parseEvalReport, type EvalReport } from './report.js';
import { renderScorecard } from './scorecard.js';
import { matrixSize, runMatrix, type MatrixSpec } from './runner.js';

/**
 * `npm run evals` — run the scripted matrix, write the report and the
 * scorecard, and diff against the stored baseline.
 *
 * **Reports the regression; does not fail the build.** `13-…` §8 is explicit:
 * "regressions fail the report, not the build". A scripted regression is
 * something we changed and want to look at, and a red build that a reviewer
 * cannot distinguish from a broken test is how a signal gets routed to the bin.
 * `--strict` is there for a CI job that does want a hard gate.
 *
 * `--record` promotes the run just made to the baseline. Deliberately a
 * separate, explicit act: a harness that quietly re-baselined would make every
 * regression disappear the moment it was observed.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** `dist/` at runtime, so the artefacts sit beside the package, not inside it. */
const OUT = resolve(HERE, '..', 'baselines');

interface Args {
	record: boolean;
	strict: boolean;
	expert: boolean;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
	const args: Args = {
		record: argv.includes('--record'),
		strict: argv.includes('--strict'),
		expert: argv.includes('--expert')
	};

	const spec: MatrixSpec = args.expert ? EXPERT_MATRIX : SCRIPTED_MATRIX;
	const name = args.expert ? 'expert' : 'scripted';
	const total = matrixSize(spec);

	process.stdout.write(`evals: running the ${name} matrix — ${total} cells\n`);
	const report = await runMatrix(spec, {
		onCell: (_cell, index) => {
			// One line, rewritten: a 240-cell matrix should not produce 240 lines of
			// CI log nobody reads.
			process.stdout.write(`\revals: ${index}/${total} cells`);
		}
	});
	process.stdout.write(`\revals: ${total}/${total} cells\n`);

	await mkdir(OUT, { recursive: true });
	const baselinePath = resolve(OUT, `${name}.baseline.json`);
	const reportPath = resolve(OUT, `${name}.report.json`);
	const scorecardPath = resolve(OUT, `${name}.scorecard.md`);

	const baseline = await readBaseline(baselinePath);
	const comparison = baseline ? compareToBaseline(report, baseline) : undefined;

	await writeFile(reportPath, `${JSON.stringify(report, null, '\t')}\n`);
	await writeFile(scorecardPath, renderScorecard(report, comparison));

	if (args.record) {
		/*
		 * **Summaries only.** A baseline is "what the numbers were", and
		 * `compareToBaseline` reads nothing but the summaries and the matrix. The
		 * per-cell detail is 140 KB of the 143 KB, it changes on every run, and it
		 * would land in git history forever — where it would make the one file a
		 * reviewer actually needs to read impossible to read. The full record sits
		 * beside it in `*.report.json`, which is not committed.
		 */
		const stored: EvalReport = { ...report, cells: [] };
		await writeFile(baselinePath, `${JSON.stringify(stored, null, '\t')}\n`);
		process.stdout.write(`evals: recorded ${baselinePath} as the new baseline\n`);
	}

	process.stdout.write(`evals: scorecard written to ${scorecardPath}\n`);
	return summarise(comparison, args.strict);
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

function summarise(comparison: BaselineComparison | undefined, strict: boolean): number {
	if (!comparison) {
		process.stdout.write('evals: no baseline yet — run with --record to store this one\n');
		return 0;
	}
	if (!comparison.comparable) {
		process.stdout.write(`evals: not compared — ${comparison.reason}\n`);
		return 0;
	}
	if (comparison.regressions.length === 0) {
		process.stdout.write('evals: no regressions against the baseline\n');
		return 0;
	}

	process.stdout.write(
		`evals: ${comparison.regressions.length} regressions against the baseline\n`
	);
	for (const move of comparison.regressions) {
		process.stdout.write(
			`  ${move.goalCardId} × ${move.brainId}: ${move.metric} ` +
				`${move.baseline.toFixed(2)} → ${move.current.toFixed(2)}\n`
		);
	}
	return strict ? 1 : 0;
}
