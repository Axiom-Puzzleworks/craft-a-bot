#!/usr/bin/env node
/**
 * **The measured error rates** (WP197, `114-DECISIONS-UNDER-PRESSURE-PLAN.md`): for each desk a live design recorded, how often the
 * model's decision was wrong with no control in place — one minus the baseline arm's agreement on the design's primary metric,
 * with the Wilson interval flipped — per suite, folded from the committed results into
 * `packages/packs/fs-bank/src/calibration/measured-error-rates.json`, which `ERROR_RATES_MEASURED` turns into rows.
 *
 *   node scripts/measured-error-rates.mjs            write the file
 *   node scripts/measured-error-rates.mjs --check    fail if the committed file differs
 *
 * Servicing is left out: its primary measure is *needs met*, an outcome, not a classification that was wrong.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMARY, baselineSide } from './live-column.mjs';
import { SUITES } from './live-suite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages/packs/fs-bank/src/calibration/measured-error-rates.json');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function measuredRates() {
	const rows = [];
	for (const suite of Object.values(SUITES)) {
		const timingsFile = join(ROOT, suite.evidenceDir, 'timings.json');
		if (!existsSync(timingsFile)) continue;
		const timings = read(timingsFile);
		for (const [base, spec] of Object.entries(PRIMARY)) {
			if (base === 'servicing-stack') continue;
			const id = `${base}-live`;
			const file = join(ROOT, suite.evidenceDir, id, `${id}.experiment-result.json`);
			if (!existsSync(file) || !timings[id]) continue;
			const result = read(file);
			const side = baselineSide(result, spec.metric);
			if (!side) continue;
			rows.push({
				id: `${spec.row}-measured-${suite.id}`,
				of: spec.row,
				what: spec.what,
				suite: suite.id,
				model: timings[id].model,
				recording: result.id,
				recordedOn: timings[id].recordedOn,
				n: side.n,
				wrong: Number((1 - side.value).toFixed(4)),
				interval: [
					Number((1 - side.interval[1]).toFixed(4)),
					Number((1 - side.interval[0]).toFixed(4))
				]
			});
		}
	}
	return rows;
}

const text = `${JSON.stringify(measuredRates(), null, '\t')}\n`;
if (process.argv.includes('--check')) {
	if (!existsSync(OUT) || JSON.stringify(read(OUT)) !== JSON.stringify(JSON.parse(text))) {
		console.error('measured-error-rates: out of date; run node scripts/measured-error-rates.mjs');
		process.exit(1);
	}
} else {
	writeFileSync(OUT, text, 'utf8');
	console.log(`wrote ${OUT}`);
}
