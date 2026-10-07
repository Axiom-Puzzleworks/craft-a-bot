#!/usr/bin/env node
/**
 * **Recording the live tier** (WP168, `112-REAL-ENOUGH-PLAN.md` §5): one command
 * per design, from the Sparks to the committed evidence.
 *
 *   node scripts/live-record.mjs <live-design-id> [...]                 record, then replay, then write the evidence
 *   node scripts/live-record.mjs --replay-only <live-design-id> [...]   no Sparks: rebuild the evidence from the cassette
 *   node scripts/live-record.mjs --replay-only --all
 *   node scripts/live-record.mjs --trials 2 --trial 0 <id>   one pass of a design performed twice; then --trial 1 (WP191)
 *
 * For each design, in order:
 *   1. `craftabot spark verify --for` — the Sparks serve the design's cartridge, or stop with the pattern to stand up;
 *   (The live run's own store — every prompt, event and outcome — is kept under `recordings/<id>/trial-0/`, gitignored; WP189.)
 *   2. `craftabot record --experiment … --provider dgx-spark --concurrency auto` — the live calls, recorded (slim) to
 *      `docs/evidence/live/<id>/<id>.provider-cassette.json`;
 *   3. `craftabot experiment run … --egress none` — the design replayed from the cassette alone, with no network: the
 *      result, its markdown and the design as it ran, copied beside the cassette;
 *   3b. `craftabot recording verify` (WP190): the recording held to what it says — every cell on its recorded path, and the
 *       live run's own store digesting to the same. A recording that does not verify stops the script before any evidence is written;
 *   4. `cells.json`: one row per cell (campaign, case, outcome, verdicts), so two recordings can be asked whether they
 *      decided the same case the same way;
 *   5. a sample of the runs as stories (`stories/`): the first of each outcome and verdict in each campaign;
 *   6. a line in `docs/evidence/live/timings.json`: the size, the cells, the wall time of the recording.
 * `--replay-only` does steps 3 to 5 from a cassette already on disk and leaves the timings alone.
 *
 * Needs the Sparks up to record (`craftabot spark up --pattern reasoning-pair --yes`) and a built harness. Never runs in CI.
 */
import { spawn } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE, liveIdOf } from './live-designs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPARK_CONFIG = 'packages/packs/dgx-spark/craftabot.config.mjs';
const OUT = join(ROOT, 'docs', 'evidence', 'live');
const WORK = join(ROOT, '.live-work');
/** The live runs' own stores (113-… D1): gitignored, kept, never deleted by this script. */
const RECORDINGS = join(ROOT, 'recordings');

function run(args, { quiet = false } = {}) {
	return new Promise((resolve) => {
		const child = spawn(
			process.execPath,
			['--env-file-if-exists=.env', 'packages/harness/dist/main.js', ...args],
			{ cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
		);
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (c) => {
			stdout += c;
			if (!quiet) process.stdout.write(c);
		});
		child.stderr.on('data', (c) => {
			stderr += c;
			if (!quiet) process.stderr.write(c);
		});
		child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
	});
}

/** The replay's reports, which sit beside one shared run store. */
const reportsIn = (replay) => readdirSync(replay).filter((n) => n.endsWith('.report.json'));

/** One row per cell: enough to ask whether two recordings decided the same case the same way. */
export function cellRows(replay, id) {
	const rows = [];
	for (const reportFile of reportsIn(replay)) {
		const campaign = reportFile.replace('.report.json', '').replace(`${id}--`, '');
		for (const cell of JSON.parse(readFileSync(join(replay, reportFile), 'utf8')).cells)
			rows.push({
				campaign,
				item: cell.item?.id ?? String(cell.ordinal),
				outcome: cell.outcome,
				verdicts: cell.evaluations ?? {}
			});
	}
	return rows.sort((a, b) => `${a.campaign}|${a.item}`.localeCompare(`${b.campaign}|${b.item}`));
}

/** Steps 3 to 5: from a cassette on disk to the committed evidence. Returns how many stories were told. */
async function replayAndWrite(id, file, dest, work) {
	const replay = join(work, 'replay');
	const replayed = await run([
		'experiment',
		'run',
		'--file',
		file,
		'--config',
		SPARK_CONFIG,
		'--egress',
		'none',
		'--out',
		replay
	]);
	if (replayed.code !== 0)
		throw new Error(`replaying ${id} from its cassette failed (exit ${replayed.code})`);
	for (const suffix of ['experiment.json', 'experiment-result.json', 'experiment-result.md'])
		copyFileSync(join(replay, `${id}.${suffix}`), join(dest, `${id}.${suffix}`));
	writeFileSync(join(dest, 'cells.json'), `${JSON.stringify(cellRows(replay, id))}\n`, 'utf8');

	const stories = join(dest, 'stories');
	rmSync(stories, { recursive: true, force: true });
	mkdirSync(stories, { recursive: true });
	let told = 0;
	for (const reportFile of reportsIn(replay)) {
		const campaign = reportFile.replace('.report.json', '').replace(`${id}--`, '');
		const seen = new Set();
		for (const cell of JSON.parse(readFileSync(join(replay, reportFile), 'utf8')).cells) {
			const verdict = Object.values(cell.evaluations ?? {}).join('+');
			const key = `${cell.outcome}|${verdict}`;
			if (seen.has(key) || !cell.runId) continue;
			seen.add(key);
			const slug = `${campaign}--${cell.outcome}-${verdict || 'none'}`.replace(
				/[^a-z0-9=+-]+/gi,
				'-'
			);
			const story = await run(
				[
					'story',
					cell.runId,
					'--store',
					join(replay, 'runs'),
					'--format',
					'markdown',
					'--out',
					join(stories, `${slug}.md`)
				],
				{ quiet: true }
			);
			if (story.code === 0) told += 1;
		}
	}
	return told;
}

/** The live run's own stores — one per trial under `recordings/<id>/` — for `recording verify` to hold the recording against. */
function liveStoreArgs(id, trials) {
	const stores = readdirSyncSafe(join(RECORDINGS, id)).filter((name) =>
		/^trial-[0-9]+$/.test(name)
	);
	// Every trial's store must be on this machine to verify them all; otherwise the recording is verified by replay alone.
	return stores.length > 0 && stores.length >= (trials ?? 1)
		? ['--live-store', join(RECORDINGS, id)]
		: [];
}

function readdirSyncSafe(path) {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

async function one(id, { replayOnly = false, trials, trial } = {}) {
	const entry = LIVE.find((e) => liveIdOf(e) === id);
	if (!entry) throw new Error(`no live design "${id}"; known: ${LIVE.map(liveIdOf).join(', ')}`);
	const file = `experiments/live/${id}.json`;
	const dest = join(OUT, id);
	const work = join(WORK, id);
	rmSync(work, { recursive: true, force: true });
	mkdirSync(dest, { recursive: true });
	console.log(`\n== ${id}${replayOnly ? ' (replay only)' : ''}`);

	let wall = 0;
	let cells;
	let entries;
	if (!replayOnly) {
		const verified = await run(['spark', 'verify', '--for', file, '--config', SPARK_CONFIG], {
			quiet: true
		});
		if (verified.code !== 0) {
			console.error(verified.stdout);
			throw new Error(`the Sparks do not serve ${id}'s cartridge; stand a pattern up first`);
		}
		const liveStore = join(RECORDINGS, id, `trial-${trial ?? 0}`);
		if (existsSync(liveStore))
			throw new Error(
				`${liveStore} already holds a live run; move or delete it first — this script never overwrites the record of a live run`
			);
		const started = Date.now();
		const recorded = await run([
			'record',
			'--experiment',
			file,
			'--provider',
			'dgx-spark',
			'--config',
			SPARK_CONFIG,
			'--concurrency',
			'auto',
			...(trials !== undefined ? ['--trials', String(trials)] : []),
			...(trial !== undefined ? ['--trial', String(trial)] : []),
			'--out',
			liveStore
		]);
		wall = Math.round((Date.now() - started) / 1000);
		if (recorded.code !== 0) throw new Error(`recording ${id} failed (exit ${recorded.code})`);
		cells = /recorded .*?(\d+) cells/.exec(recorded.stdout)?.[1];
		entries = /(\d+) calls/.exec(recorded.stdout)?.[1];
	} else if (!existsSync(join(dest, `${id}.provider-cassette.json`))) {
		throw new Error(`${id} has no cassette to replay`);
	}

	// A recording is held to what it says before anything is written from it (WP190).
	const cassette = join(dest, `${id}.provider-cassette.json`);
	const isRecording = JSON.parse(readFileSync(cassette, 'utf8')).kind === 'provider-recording';
	const verified = !isRecording
		? { code: 0, stdout: '', stderr: '' }
		: await run(
				[
					'recording',
					'verify',
					'--recording',
					cassette,
					'--file',
					file,
					'--config',
					SPARK_CONFIG,
					'--out',
					join(work, 'verify'),
					...(trials !== undefined ? ['--trials', String(trials)] : []),
					...liveStoreArgs(id, trials)
				],
				{ quiet: true }
			);
	if (verified.code !== 0) {
		console.error(verified.stdout || verified.stderr);
		throw new Error(`${id}: the recording does not verify against itself; nothing was written`);
	}
	const told = await replayAndWrite(id, file, dest, work);

	if (!replayOnly) {
		const timings = join(OUT, 'timings.json');
		const all = existsSync(timings) ? JSON.parse(readFileSync(timings, 'utf8')) : {};
		all[id] = {
			recordedOn: new Date().toISOString().slice(0, 10),
			model: 'Qwen3.5-122B-A10B-NVFP4',
			cartridge: 'dgx-spark/giant-qwen',
			size: entry.size,
			cells: Number(cells),
			entries: Number(entries),
			wallSeconds: wall,
			stories: told
		};
		writeFileSync(timings, `${JSON.stringify(all, null, '\t')}\n`, 'utf8');
	}
	rmSync(work, { recursive: true, force: true });
	console.log(
		`== ${id}: ${replayOnly ? '' : `${cells} cells, ${entries} entries, ${wall} s, `}${told} stories`
	);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const args = process.argv.slice(2);
	const replayOnly = args.includes('--replay-only');
	const numberAfter = (flag) => {
		const at = args.indexOf(flag);
		return at >= 0 ? Number(args[at + 1]) : undefined;
	};
	const trials = numberAfter('--trials');
	const trial = numberAfter('--trial');
	const flagValues = new Set([
		args[args.indexOf('--trials') + 1],
		args[args.indexOf('--trial') + 1]
	]);
	const ids = args.includes('--all')
		? LIVE.map(liveIdOf)
		: args.filter((a) => !a.startsWith('--') && !(flagValues.has(a) && /^\d+$/.test(a)));
	if (ids.length === 0) {
		console.error(
			'usage: node scripts/live-record.mjs [--replay-only] <live-design-id> [...] | --all'
		);
		process.exit(2);
	}
	for (const id of ids)
		await one(id, {
			replayOnly,
			...(trials !== undefined ? { trials } : {}),
			...(trial !== undefined ? { trial } : {})
		});
}
