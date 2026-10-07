#!/usr/bin/env node
/**
 * **The live smoke before the re-record** (WP194, `113-RECORDING-AND-RELIABILITY.md` §6): the items the first live
 * recording failed on for real — a call that could not succeed, repeated until the turn budget ran out — and a few it
 * did not, recorded once each on the Sparks with the desk fixes of WP193, to read whether the loops are gone before
 * seven hours of recording rest on it.
 *
 *   node scripts/live-smoke.mjs                  the Sparks, `reasoning-pair` stood up (`craftabot spark up --pattern reasoning-pair --yes`)
 *   node scripts/live-smoke.mjs --provider mock  the same path with no model: what the script's own test runs
 *
 * The items are `docs/evidence/live/smoke-items.json`. Everything is written under `recordings/smoke/` (gitignored):
 * a recording per design and the live run's own store. It reads the recordings back and prints, per design and per
 * item, how each cell ended and how many calls it made — a loop is a cell that used its whole turn budget.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPARK_CONFIG = 'packages/packs/dgx-spark/craftabot.config.mjs';
const OUT = join(ROOT, 'recordings', 'smoke');

export const itemKey = (item) => `|${item}|`;

/** What became of the items that failed for real, and of the controls, from a recording's cells. */
export function readSmoke(recording, items) {
	const byItem = new Map();
	for (const cell of recording.cells) {
		const parts = cell.cellKey.split('|');
		const item = parts[6];
		const held = byItem.get(item) ?? [];
		held.push({ outcome: cell.outcome ?? 'unknown', calls: cell.calls.length });
		byItem.set(item, held);
	}
	const describe = (list) =>
		(list ?? []).map((c) => `${c.outcome} (${c.calls} calls)`).join(', ') || 'not run';
	const failed = items.failedForReal.map(({ item }) => ({ item, now: byItem.get(item) ?? [] }));
	const stillFailing = failed.filter(({ now }) => now.some((c) => c.outcome === 'ERROR'));
	const controlsOff = items.controls.filter((item) =>
		(byItem.get(item) ?? []).some((c) => c.outcome === 'ERROR')
	);
	return {
		failedForReal: failed.length,
		stillFailing: stillFailing.map((entry) => entry.item),
		controls: items.controls.length,
		controlsNowFailing: controlsOff,
		lines: [
			...failed.map(({ item, now }) => `  was looping  ${item}: ${describe(now)}`),
			...items.controls.map((item) => `  was fine     ${item}: ${describe(byItem.get(item))}`)
		]
	};
}

function main(argv) {
	const provider = argv.includes('--provider') ? argv[argv.indexOf('--provider') + 1] : 'dgx-spark';
	const wanted = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--provider');
	const all = JSON.parse(
		readFileSync(join(ROOT, 'docs', 'evidence', 'live', 'smoke-items.json'), 'utf8')
	);
	let bad = 0;
	for (const [id, items] of Object.entries(all.designs)) {
		if (wanted.length > 0 && !wanted.includes(id)) continue;
		const work = join(OUT, id);
		mkdirSync(work, { recursive: true });
		const design = JSON.parse(
			readFileSync(join(ROOT, 'experiments', 'live', `${id}.json`), 'utf8')
		);
		const recordingFile = join(work, `${id}.smoke.provider-cassette.json`);
		for (const brain of design.design.template.brains)
			if (brain.cassette) brain.cassette = recordingFile;
		const designFile = join(work, 'design.json');
		writeFileSync(designFile, JSON.stringify(design));
		const cells = [...items.failedForReal.map((e) => e.item), ...items.controls]
			.map(itemKey)
			.join(',');
		console.log(
			`\n== ${id}: ${items.failedForReal.length} items that failed for real, ${items.controls.length} controls`
		);
		const recorded = spawnSync(
			process.execPath,
			[
				'--env-file-if-exists=.env',
				'packages/harness/dist/main.js',
				'record',
				'--experiment',
				designFile,
				'--provider',
				provider,
				'--config',
				SPARK_CONFIG,
				'--cells',
				cells,
				...(provider === 'dgx-spark' ? ['--concurrency', 'auto'] : []),
				'--out',
				join(work, 'live')
			],
			{ cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] }
		);
		if (recorded.status !== 0) {
			console.error(`${id}: the smoke recording failed (exit ${recorded.status})`);
			bad += 1;
			continue;
		}
		const read = readSmoke(JSON.parse(readFileSync(recordingFile, 'utf8')), items);
		for (const line of read.lines) console.log(line);
		console.log(
			`  ${read.failedForReal - read.stillFailing.length} of ${read.failedForReal} no longer fail; ${read.controls - read.controlsNowFailing.length} of ${read.controls} controls still fine`
		);
		if (read.stillFailing.length > 0)
			console.log(`  still failing: ${read.stillFailing.join(', ')}`);
	}
	return bad > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	process.exit(main(process.argv.slice(2)));
