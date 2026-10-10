#!/usr/bin/env node
/**
 * **The measured habits** (plan 114 WP203, D7): how often a live model, in the brain's seat, repeated the call it had just made, or
 * answered in prose where the desk needed a tool call — counted over the agent's calls in each live design's committed cassette, per
 * suite, and folded into `packages/packs/fs-bank/src/calibration/measured-habits.json`, which `HABIT_RATES` turns into rows and
 * `bankHabitModels` into error models the scripted tier plays. The cassette keeps every call of every cell, so the figure is
 * reproducible by anyone with the repository.
 *
 *   node scripts/measured-habits.mjs            write the file
 *   node scripts/measured-habits.mjs --check    fail if the committed file differs
 *
 * A rate here is per *call*, and the calls of one cell are not independent (a model that starts repeating keeps on): the interval is the
 * Wilson interval over calls and understates the uncertainty, which `cellsWith` (cells showing the habit at least once) is there to temper.
 * Only the agent's own calls count; a live customer's lines (`role: seat`) and a call that failed (no response) are left out.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUITES } from './live-suite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages/packs/fs-bank/src/calibration/measured-habits.json');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const SERVED = ['giant', 'quick'];

/** Wilson score interval at 95%. */
function wilson(k, n) {
	if (n === 0) return [0, 1];
	const z = 1.96;
	const p = k / n;
	const d = 1 + (z * z) / n;
	const centre = (p + (z * z) / (2 * n)) / d;
	const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
	return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
const round = (x) => Number(x.toFixed(4));

export function measuredHabits() {
	const rows = [];
	for (const id of SERVED) {
		const suite = SUITES[id];
		const timingsFile = join(ROOT, suite.evidenceDir, 'timings.json');
		if (!existsSync(timingsFile)) continue;
		const timings = read(timingsFile);
		for (const design of Object.keys(timings).sort()) {
			const file = join(ROOT, suite.evidenceDir, design, `${design}.provider-cassette.json`);
			if (!existsSync(file) || design.endsWith('-b')) continue;
			const cassette = read(file);
			let calls = 0;
			let noCall = 0;
			let repeat = 0;
			let cellsWithRepeat = 0;
			let cellsWithNoCall = 0;
			for (const cell of cassette.cells) {
				let previous = null;
				let sawRepeat = false;
				let sawNoCall = false;
				for (const call of cell.calls) {
					if (call.role !== undefined && call.role !== 'agent') continue;
					if (!call.response) continue;
					calls += 1;
					const toolCall = call.response.toolCall;
					if (!toolCall) {
						noCall += 1;
						sawNoCall = true;
						previous = null;
						continue;
					}
					const key = JSON.stringify(toolCall);
					if (key === previous) {
						repeat += 1;
						sawRepeat = true;
					}
					previous = key;
				}
				if (sawRepeat) cellsWithRepeat += 1;
				if (sawNoCall) cellsWithNoCall += 1;
			}
			if (calls === 0) continue;
			rows.push({
				id: `${design.replace(/-live(-seat)?$/, (m) => (m.includes('seat') ? '-seat' : ''))}-habits-${id}`,
				design,
				suite: id,
				model: timings[design].model,
				recordedOn: timings[design].recordedOn,
				calls,
				cells: cassette.cells.length,
				repeat: round(repeat / calls),
				repeatInterval: wilson(repeat, calls).map(round),
				noCall: round(noCall / calls),
				noCallInterval: wilson(noCall, calls).map(round),
				cellsWithRepeat,
				cellsWithNoCall
			});
		}
	}
	return rows;
}

const text = `${JSON.stringify(measuredHabits(), null, '\t')}\n`;
if (process.argv.includes('--check')) {
	if (!existsSync(OUT) || JSON.stringify(read(OUT)) !== JSON.stringify(JSON.parse(text))) {
		console.error('measured-habits: out of date; run node scripts/measured-habits.mjs');
		process.exit(1);
	}
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	writeFileSync(OUT, text, 'utf8');
	console.log(`wrote ${OUT}`);
}
