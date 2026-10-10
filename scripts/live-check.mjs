#!/usr/bin/env node
/**
 * **The live tier replays** (WP168, `112-REAL-ENOUGH-PLAN.md` §5): every live
 * design under `experiments/live/` is replayed from its committed cassette with
 * no network and no key (`--egress none`), and the result must be the committed
 * one. Unlike the reference experiments, which CI runs at a reduced size and
 * holds only to a shape, a replay is exact: the same recorded answers over the
 * same book give the same effects, to the last digit. So this compares every
 * effect's numbers, not only which effects there are.
 *
 *   node scripts/live-check.mjs [<live-design-id> …]     default: every committed live result
 *
 * It also fails on a live design whose cassette is missing, and on a committed
 * result with no design.
 *
 * A cell-scoped recording (WP190, `113-RECORDING-AND-RELIABILITY.md`) is held to
 * more than its result: every cell must replay on the path the live run took
 * (`replay.status: 'match'`, no recorded call left unasked), and a prompt the
 * recording did not make is a `replay-diverged` failure that names the cell.
 *
 * A design whose prompts a desk fix has changed on purpose is listed in
 * `PENDING_RE_RECORD`: it is skipped, and said to be, until it is recorded again.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suiteFrom } from './live-suite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPARK_CONFIG = 'packages/packs/dgx-spark/craftabot.config.mjs';

/** Live designs whose recording no longer matches the desk on purpose, until re-recorded (113-… WP194). Empty means none. */
export const PENDING_RE_RECORD = new Set([]);

/** Retired designs whose committed evidence stays as the record of what they measured; there is no design to replay (113 §12). */
export const RETIRED = new Set(['lending-stack-live-b']);

/** Folders under an evidence directory that hold archived documents, not a design's result. */
const ARCHIVES = new Set(['superseded']);

/** What a replay of a cell-scoped recording must not show: a cell off its recorded path, an unasked call, a divergence. */
export function replayProblems(reports) {
	const problems = [];
	for (const report of reports)
		for (const cell of report.cells ?? []) {
			const key = `${report.campaignId} ${cell.item?.id ?? cell.ordinal} seed ${cell.seed}`;
			if (typeof cell.error === 'string' && cell.error.startsWith('replay-diverged'))
				problems.push(`${key}: ${cell.error.slice(0, 200)}`);
			else if (cell.replay && cell.replay.status !== 'match')
				problems.push(
					`${key}: replay ${cell.replay.status}${cell.replay.unused ? `, ${cell.replay.unused} recorded calls unasked` : ''}${cell.replay.divergedAt !== undefined ? `, diverged at call #${cell.replay.divergedAt}` : ''}`
				);
		}
	return problems;
}

/** What a replay must reproduce of one effect: its numbers, not its ids or its clock. */
export function effectKey(effect) {
	return JSON.stringify([
		effect.metricId,
		effect.factor,
		effect.tier ?? null,
		effect.baseline,
		effect.treatment,
		effect.delta,
		effect.interval,
		effect.p ?? null,
		effect.underpowered
	]);
}

export function compareReplay(committed, replayed) {
	const problems = [];
	if (committed.verdict !== replayed.verdict)
		problems.push(`verdict: committed ${committed.verdict}, replayed ${replayed.verdict}`);
	const a = committed.effects.map(effectKey).sort();
	const b = replayed.effects.map(effectKey).sort();
	if (a.length !== b.length) problems.push(`effects: committed ${a.length}, replayed ${b.length}`);
	for (const key of a) if (!b.includes(key)) problems.push(`not reproduced: ${key.slice(0, 160)}`);
	return problems;
}

function main(args) {
	// `--suite quick` checks the 35B suite's designs, in its own folders (113 §12); the default is the 122B's.
	const { suite, rest: argv } = suiteFrom(args);
	const live = join(ROOT, suite.evidenceDir);
	const committed = existsSync(live)
		? readdirSync(live, { withFileTypes: true })
				.filter((d) => d.isDirectory() && !ARCHIVES.has(d.name))
				.map((d) => d.name)
		: [];
	const ids = argv.length > 0 ? argv : committed;
	if (ids.length === 0) {
		console.log('live-check: no live results are committed yet');
		return 0;
	}
	let failed = 0;
	for (const id of ids) {
		if (suite.id === 'giant' && RETIRED.has(id)) {
			console.log(
				`live-check: ${id}: retired — its evidence is the first measurement of the live tier’s own variance`
			);
			continue;
		}
		if (suite.id === 'giant' && PENDING_RE_RECORD.has(id)) {
			console.log(`live-check: ${id}: skipped — pending re-record`);
			continue;
		}
		const design = join(suite.experimentsDir, `${id}.json`);
		const cassette = join(suite.evidenceDir, id, `${id}.provider-cassette.json`);
		const resultFile = join(live, id, `${id}.experiment-result.json`);
		if (
			!existsSync(join(ROOT, design)) ||
			!existsSync(join(ROOT, cassette)) ||
			!existsSync(resultFile)
		) {
			console.error(`live-check: ${id}: needs ${design}, ${cassette} and ${resultFile}`);
			failed += 1;
			continue;
		}
		const out = join('campaign-out', suite.id === 'giant' ? 'live' : `live-${suite.id}`, id);
		mkdirSync(join(ROOT, out), { recursive: true });
		const ran = spawnSync(
			process.execPath,
			[
				'packages/harness/dist/main.js',
				'experiment',
				'run',
				'--file',
				design,
				'--config',
				SPARK_CONFIG,
				'--egress',
				'none',
				'--out',
				out
			],
			{ cwd: ROOT, encoding: 'utf8' }
		);
		if (ran.status !== 0) {
			console.error(`live-check: ${id}: the replay failed\n${ran.stderr || ran.stdout}`);
			failed += 1;
			continue;
		}
		const replayed = JSON.parse(
			readFileSync(join(ROOT, out, `${id}.experiment-result.json`), 'utf8')
		);
		const problems = compareReplay(JSON.parse(readFileSync(resultFile, 'utf8')), replayed);
		const reports = readdirSync(join(ROOT, out))
			.filter((name) => name.endsWith('.report.json'))
			.map((name) => JSON.parse(readFileSync(join(ROOT, out, name), 'utf8')));
		problems.push(...replayProblems(reports));
		if (problems.length > 0) {
			console.error(`live-check: ${id}: the replay is not the committed result`);
			for (const problem of problems) console.error(`  ${problem}`);
			failed += 1;
		} else
			console.log(
				`live-check: ${id}: reproduced (${replayed.effects.length} effects, ${replayed.verdict})`
			);
	}
	return failed > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
	process.exit(main(process.argv.slice(2)));
