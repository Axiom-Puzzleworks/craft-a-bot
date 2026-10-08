#!/usr/bin/env node
/**
 * **The two live suites, side by side** (`113-RECORDING-AND-RELIABILITY.md`, the 35B suite): the 122B's recorded results beside
 * the 35B's, design by design, folded from the two suites' committed results and timings into
 * `docs/evidence/live-35b/COMPARISON.md`.
 *
 *   node scripts/live-compare.mjs            write the file
 *   node scripts/live-compare.mjs --check    fail if the committed file differs from what this would write
 *
 * It says nothing until the 35B suite has been recorded. Every figure is a measurement of this synthetic bank from one sample of
 * each model at temperature 0, performed twice where the suite says so, never a statement about either model in general.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { PRIMARY, baselineSide, reliabilityRows } from './live-column.mjs';
import { SUITES } from './live-suite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const band = (i) => `${pct(i[0])}–${pct(i[1])}`;

/** The share of a design's cells that did not end in success: the cells a model's habits lost. */
export function lostShare(cells) {
	const bot = cells.filter((cell) => !String(cell.campaign).includes('rules-only'));
	if (bot.length === 0) return 0;
	return bot.filter((cell) => cell.outcome !== 'SUCCESS').length / bot.length;
}

/** One design's row for one suite, from its committed result, cells and timings; undefined when the suite has not recorded it. */
export function suiteRow(suite, id, timings) {
	const dir = join(ROOT, suite.evidenceDir, id);
	const resultFile = join(dir, `${id}.experiment-result.json`);
	const cellsFile = join(dir, 'cells.json');
	if (!existsSync(resultFile) || !existsSync(cellsFile) || !timings[id]) return undefined;
	const result = read(resultFile);
	const base = id.replace(/-live(-seat)?$/, '');
	const spec = PRIMARY[base];
	const side = spec && !id.endsWith('-seat') ? baselineSide(result, spec.metric) : undefined;
	const rel = spec && !id.endsWith('-seat') ? reliabilityRows(result, spec.metric)[0] : undefined;
	return {
		id,
		what: spec?.what,
		side,
		passHatK: rel?.m?.passHatK,
		verdict: result.verdict,
		// A scenario design ends its cells by the step limit by design, so "lost" says nothing there.
		lost: id.startsWith('controls') ? undefined : lostShare(read(cellsFile)),
		wallMinutes: Math.round(timings[id].wallSeconds / 60),
		tokens: result.effects[0]?.cost?.tokensPerCase?.baseline,
		cells: timings[id].cells
	};
}

export function renderComparison(rows) {
	const lines = [
		'# The 122B and the 35B on the same live designs',
		'',
		`Written by \`node scripts/live-compare.mjs\` from the two suites' committed results; do not edit by hand. Both suites run the same ten designs on the same books with the same prompts and a ${SUITES.giant.short}/${SUITES.quick.short} model in the brain's seat (\`${SUITES.giant.model}\` against \`${SUITES.quick.model}\`), at temperature 0. The 122B suite performs only some designs twice; the 35B suite performs every one twice, so the reliability columns compare where both have them. Every figure is a measurement of this synthetic bank from one sample of each model, never a statement about either model in general.`,
		'',
		'| Design | Measured | 122B (95% interval) | 35B (95% interval) | pass^k 122B / 35B | Cells lost 122B / 35B | Wall time 122B / 35B | Tokens a case 122B / 35B |',
		'|---|---|---|---|---|---|---|---|'
	];
	const side = (s) => (s ? `${pct(s.value)} (${band(s.interval)})` : '—');
	const hat = (s) => (s ? pct(s.value) : '—');
	for (const { giant, quick } of rows)
		lines.push(
			`| \`${(giant ?? quick).id}\` | ${(giant ?? quick).what ?? 'the design’s own measures'} | ${side(giant?.side)} | ${side(quick?.side)} | ${hat(giant?.passHatK)} / ${hat(quick?.passHatK)} | ${giant?.lost !== undefined ? pct(giant.lost) : '—'} / ${quick?.lost !== undefined ? pct(quick.lost) : '—'} | ${giant ? `${giant.wallMinutes} min` : '—'} / ${quick ? `${quick.wallMinutes} min` : '—'} | ${giant?.tokens ? Math.round(giant.tokens) : '—'} / ${quick?.tokens ? Math.round(quick.tokens) : '—'} |`
		);
	lines.push('');
	return lines.join('\n');
}

export async function render() {
	const timings = (suite) => {
		const file = join(ROOT, suite.evidenceDir, 'timings.json');
		return existsSync(file) ? read(file) : {};
	};
	const giantTimings = timings(SUITES.giant);
	const quickTimings = timings(SUITES.quick);
	const ids = Object.keys(quickTimings);
	if (ids.length === 0) return undefined;
	const rows = ids.map((id) => ({
		giant: suiteRow(SUITES.giant, id, giantTimings),
		quick: suiteRow(SUITES.quick, id, quickTimings)
	}));
	return renderComparison(rows.filter((row) => row.giant ?? row.quick));
}

async function main(argv) {
	const out = join(ROOT, SUITES.quick.evidenceDir, 'COMPARISON.md');
	const raw = await render();
	if (raw === undefined) {
		console.log('live-compare: the 35B suite has not been recorded yet');
		return 0;
	}
	const text = await prettier.format(raw, {
		...(await prettier.resolveConfig(out)),
		parser: 'markdown'
	});
	if (argv.includes('--check')) {
		if (
			!existsSync(out) ||
			readFileSync(out, 'utf8').replace(/\r\n/g, '\n') !== text.replace(/\r\n/g, '\n')
		) {
			console.error(
				'live-compare: docs/evidence/live-35b/COMPARISON.md is out of date; run node scripts/live-compare.mjs'
			);
			return 1;
		}
		return 0;
	}
	writeFileSync(out, text, 'utf8');
	console.log(`wrote ${out}`);
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	process.exit(await main(process.argv.slice(2)));
