#!/usr/bin/env node
/**
 * **The reference experiments' shape check** (WP90, `80-…` §4): a reduced
 * run in CI against the committed full-size result — the same metric ids,
 * factors and levels, a verdict from the same three, every effect with
 * cells on both sides — never the values, which a smaller book changes.
 *
 *   node scripts/experiment-shape.mjs <committed-dir> <reduced-dir>
 *
 * Both directories hold `<experiment>/<experiment>.experiment-result.json`
 * (the committed layout) or `<experiment>.experiment-result.json` (what
 * `craftabot experiment run --out` writes). Exits 1 on the first mismatch.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VERDICTS = new Set(['supported', 'not-supported', 'inconclusive']);

export function shapeOf(result) {
	return {
		experimentId: result.experimentId,
		effects: result.effects
			.map(
				(effect) =>
					`${effect.metricId}|${effect.factor.axis}|${effect.factor.baseline}|${effect.factor.treatment}`
			)
			.sort()
	};
}

/** The mismatches between a committed result and a reduced one; empty when the shape holds. */
export function compareShape(committed, reduced) {
	const problems = [];
	const a = shapeOf(committed);
	const b = shapeOf(reduced);
	if (a.experimentId !== b.experimentId)
		problems.push(`experiment id: ${a.experimentId} vs ${b.experimentId}`);
	const missing = a.effects.filter((key) => !b.effects.includes(key));
	const extra = b.effects.filter((key) => !a.effects.includes(key));
	for (const key of missing) problems.push(`effect missing from the reduced run: ${key}`);
	for (const key of extra) problems.push(`effect the committed run lacks: ${key}`);
	if (!VERDICTS.has(reduced.verdict))
		problems.push(`verdict not one of the three: ${reduced.verdict}`);
	for (const effect of reduced.effects) {
		if (effect.baseline.n === 0 || effect.treatment.n === 0)
			problems.push(`no cells on a side of ${effect.metricId} (${effect.factor.treatment})`);
	}
	if (typeof reduced.digest !== 'string' || !/^[0-9a-f]{64}$/.test(reduced.digest))
		problems.push('the reduced result carries no digest');
	return problems;
}

function readResult(dir, experimentId) {
	const nested = join(dir, experimentId, `${experimentId}.experiment-result.json`);
	const flat = join(dir, `${experimentId}.experiment-result.json`);
	const path = existsSync(nested) ? nested : flat;
	if (!existsSync(path)) return undefined;
	return JSON.parse(readFileSync(path, 'utf8'));
}

function experimentsIn(dir) {
	return readdirSync(dir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				existsSync(join(dir, entry.name, `${entry.name}.experiment-result.json`))
		)
		.map((entry) => entry.name)
		.sort();
}

function main(argv) {
	const [committedDir, reducedDir] = argv;
	if (!committedDir || !reducedDir) {
		console.error('usage: node scripts/experiment-shape.mjs <committed-dir> <reduced-dir>');
		return 2;
	}
	let failed = 0;
	const ids = experimentsIn(committedDir);
	if (ids.length === 0) {
		console.error(`experiment-shape: no committed result under ${committedDir}`);
		return 2;
	}
	for (const id of ids) {
		const committed = readResult(committedDir, id);
		const reduced = readResult(reducedDir, id);
		if (!reduced) {
			console.error(`experiment-shape: ${id} — no reduced result under ${reducedDir}`);
			failed += 1;
			continue;
		}
		const problems = compareShape(committed, reduced);
		if (problems.length === 0) {
			console.log(
				`experiment-shape: ${id} — shape holds (${reduced.effects.length} effects, ${reduced.verdict})`
			);
		} else {
			failed += 1;
			for (const problem of problems) console.error(`experiment-shape: ${id} — ${problem}`);
		}
	}
	return failed === 0 ? 0 : 1;
}

if (process.argv[1] && /experiment-shape\.mjs$/.test(process.argv[1])) {
	process.exitCode = main(process.argv.slice(2));
}
