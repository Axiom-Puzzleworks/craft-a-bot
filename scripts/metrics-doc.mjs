#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * `docs/metrics.md` from `@craftabot/metrics`'s validation suite (WP76,
 * `docs/design-day2/68-METRICS.md` §4): every metric, its definition, its
 * interval method, its hand case, its planted effect and its null rate —
 * the page a model-risk reader asks for when they ask "how do you know
 * your fairness number is right?". Generated, never edited: `npm run
 * metrics:doc` writes it; the build runs `--check` and fails when the
 * committed page is not what the suite produces now, as `docs/schemas/`
 * does. The suite is deterministic (seeds 1…200 at n = 2,000), so the
 * page is stable until a metric changes.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'docs', 'metrics.md');
const SUITE = join(REPO, 'packages', 'metrics', 'dist', 'validation', 'suite.js');

if (!existsSync(SUITE)) {
	console.error(`metrics-doc: no build at ${SUITE}. Run \`npm run build\` first.`);
	process.exit(1);
}
const { validationReport, renderValidationReport } = await import(pathToFileURL(SUITE).href);
const text = renderValidationReport(validationReport({ seeds: 200, n: 2000 }));

if (process.argv.includes('--check')) {
	const committed = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
	if (committed !== text) {
		console.error(
			'metrics-doc: docs/metrics.md is out of date — a metric or its validation changed. Run `npm run metrics:doc` and commit the page.'
		);
		process.exit(1);
	}
	console.log('metrics-doc: docs/metrics.md matches the validation suite');
} else {
	writeFileSync(OUT, text);
	console.log('metrics-doc: wrote docs/metrics.md');
}
