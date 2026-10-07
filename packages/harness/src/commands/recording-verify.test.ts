import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseProviderRecording, type ProviderRecordingFile } from '@craftabot/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { recordExperiment } from './record-provider.js';
import { recordingVerify } from './recording.js';

/**
 * **`craftabot recording verify`** (WP190, `113-RECORDING-AND-RELIABILITY.md`
 * §4.5): the lending stack design recorded through the mock provider at a small
 * population, then held to its recording — every call answered from the
 * prompts recorded, every cell on the path digest the live run had, the live
 * run's own store digesting to the same. Then four ways of breaking it, each
 * named: a moved prompt, a moved path, a cell lost, a call left unasked.
 */
// Recording a design runs in the hooks too, and under a loaded machine (the full suite) that outlasts the default.
vi.setConfig({ hookTimeout: 600_000, testTimeout: 600_000 });

const ROOT = resolve(import.meta.dirname, '../../../..');
const roots: string[] = [];
afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const fixedNow = () => {
	let n = 0;
	return () => new Date(Date.UTC(2026, 9, 7, 12, 0, n++)).toISOString();
};
const fixedIds = () => {
	let n = 0;
	return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};

describe('recording verify (WP190)', { timeout: 600_000 }, () => {
	let root: string;
	let file: string;
	let recordingPath: string;
	let original: ProviderRecordingFile;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), 'craftabot-verify-'));
		roots.push(root);
		recordingPath = join(root, 'lending-stack.provider-cassette.json');
		const design = JSON.parse(
			await readFile(join(ROOT, 'experiments', 'lending-stack.json'), 'utf8')
		) as {
			design: {
				template: { brains: unknown[] };
				factors: Array<{ axis: string }>;
				baseline: Record<string, string>;
			};
		};
		design.design.factors = design.design.factors.filter((factor) => factor.axis !== 'brain');
		delete design.design.baseline['brain'];
		design.design.template.brains = [{ id: 'live', tier: 'live', cassette: recordingPath }];
		file = join(root, 'design.json');
		await writeFile(file, JSON.stringify(design), 'utf8');
		await recordExperiment({
			file,
			provider: 'mock',
			out: join(root, 'live'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			size: 60,
			now: fixedNow(),
			newId: fixedIds(),
			clock: () => 0
		});
		original = parseProviderRecording(JSON.parse(await readFile(recordingPath, 'utf8')));
	});

	const verify = (name: string, liveStore?: string) =>
		recordingVerify({
			recording: recordingPath,
			file,
			out: join(root, name),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			size: 60,
			...(liveStore !== undefined ? { liveStore } : {}),
			now: fixedNow(),
			newId: fixedIds()
		});

	const write = (recording: ProviderRecordingFile) =>
		writeFile(recordingPath, JSON.stringify(recording), 'utf8');

	it('holds a faithful recording: every cell on its recorded path, and the live store digesting to the same', async () => {
		const report = await verify('ok', join(root, 'live'));
		expect(report).toMatchObject({
			ok: true,
			diverged: [],
			mismatch: [],
			missing: [],
			unusedCalls: 0,
			liveMismatch: []
		});
		expect(report.replayedCells).toBe(original.cells.length);
		expect(report.match).toBe(original.cells.length);
		// Journeys: the live store held more than the last stage's run, and the check read them all.
		expect(report.liveChecked).toBe(original.cells.length);
	});

	it('names a moved prompt: the recorded digest is not the one asked, and nothing is substituted', async () => {
		const moved = structuredClone(original);
		const call = moved.cells[0]!.calls[0]!;
		call.promptDigest = 'f'.repeat(64);
		await write(moved);
		try {
			const report = await verify('moved');
			expect(report.ok).toBe(false);
			expect(report.diverged).toContain(moved.cells[0]!.cellKey);
		} finally {
			await write(original);
		}
	});

	it('names a moved path: every call answered, but the decisions are not the recorded ones', async () => {
		const moved = structuredClone(original);
		moved.cells[0]!.pathDigest = '0'.repeat(64);
		await write(moved);
		try {
			const report = await verify('path', join(root, 'live'));
			expect(report.ok).toBe(false);
			expect(report.mismatch).toEqual([moved.cells[0]!.cellKey]);
			// The live store disagrees with the tampered digest too: the recording and its audit copy are held to each other.
			expect(report.liveMismatch).toEqual([moved.cells[0]!.cellKey]);
		} finally {
			await write(original);
		}
	});

	it('names a cell the replay never ran, and a recorded call it never asked for', async () => {
		const lost = structuredClone(original);
		lost.cells.push({
			cellKey: 'lending-stack--nowhere|s|b|g|live|||0|0',
			trial: 0,
			calls: []
		});
		const spare = structuredClone(original);
		const target = spare.cells[0]!;
		target.calls.push({ ...target.calls.at(-1)!, seq: target.calls.length });
		for (const [name, recording] of [
			['lost', lost],
			['spare', spare]
		] as const) {
			await write(recording);
			try {
				const report = await verify(name);
				expect(report.ok).toBe(false);
				if (name === 'lost')
					expect(report.missing).toEqual(['lending-stack--nowhere|s|b|g|live|||0|0']);
				else expect(report.unusedCalls).toBe(1);
			} finally {
				await write(original);
			}
		}
	});
});

describe('a design performed more than once (WP191)', { timeout: 600_000 }, () => {
	let root: string;
	let design: unknown;

	const designFile = async (name: string, cassette: string) => {
		const body = structuredClone(design) as {
			design: { template: { brains: unknown[] } };
		};
		body.design.template.brains = [{ id: 'live', tier: 'live', cassette }];
		const file = join(root, `${name}.json`);
		await writeFile(file, JSON.stringify(body), 'utf8');
		return file;
	};
	const record = async (
		file: string,
		extra: { trials?: number; trial?: number; size?: number },
		out: string
	) =>
		recordExperiment({
			file,
			provider: 'mock',
			out: join(root, out),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			size: extra.size ?? 60,
			...(extra.trials !== undefined ? { trials: extra.trials } : {}),
			...(extra.trial !== undefined ? { trial: extra.trial } : {}),
			now: fixedNow(),
			newId: fixedIds(),
			clock: () => 0
		});
	const read = async (path: string) =>
		parseProviderRecording(JSON.parse(await readFile(path, 'utf8')));

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), 'craftabot-trials-'));
		roots.push(root);
		const base = JSON.parse(
			await readFile(join(ROOT, 'experiments', 'lending-stack.json'), 'utf8')
		) as { design: { factors: Array<{ axis: string }>; baseline: Record<string, string> } };
		base.design.factors = base.design.factors.filter((factor) => factor.axis !== 'brain');
		delete base.design.baseline['brain'];
		design = base;
	});

	it('records each cell once per trial, each its own cell with its own calls, and verifies', async () => {
		const once = join(root, 'once.provider-cassette.json');
		const first = await record(await designFile('once', once), {}, 'once-out');
		const twice = join(root, 'twice.provider-cassette.json');
		const file = await designFile('twice', twice);
		const recorded = await record(file, { trials: 2 }, 'twice-out');
		const single = await read(once);
		const double = await read(twice);
		expect(double.manifest.trials).toBe(2);
		expect(double.cells.length).toBe(single.cells.length * 2);
		expect(new Set(double.cells.map((cell) => cell.cellKey)).size).toBe(double.cells.length);
		expect(new Set(double.cells.map((cell) => cell.trial))).toEqual(new Set([0, 1]));
		expect(double.cells.every((cell) => cell.cellKey.endsWith(`|${cell.trial}`))).toBe(true);
		expect(recorded.cells).toBe(first.cells * 2);
		const report = await recordingVerify({
			recording: twice,
			file,
			out: join(root, 'twice-verify'),
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			size: 60,
			// The design's trials are part of what ran: each cell's ordinal, and so its ids and its draws, depend on them.
			trials: 2,
			liveStore: join(root, 'twice-out'),
			now: fixedNow(),
			newId: fixedIds()
		});
		expect(report).toMatchObject({ ok: true, replayedCells: double.cells.length, mismatch: [] });
		expect(report.liveChecked).toBe(double.cells.length);
	});

	it('records a design in passes — one trial, then the next — into the same recording, to the same cells', async () => {
		const together = join(root, 'together.provider-cassette.json');
		await record(await designFile('together', together), { trials: 2 }, 'together-out');
		const passes = join(root, 'passes.provider-cassette.json');
		const file = await designFile('passes', passes);
		await record(file, { trials: 2, trial: 0 }, 'passes-0');
		const afterFirst = await read(passes);
		expect(afterFirst.cells.every((cell) => cell.trial === 0)).toBe(true);
		await record(file, { trials: 2, trial: 1 }, 'passes-1');
		const joined = await read(passes);
		const whole = await read(together);
		expect(joined.manifest.trials).toBe(2);
		const byKey = (recording: typeof joined) =>
			Object.fromEntries(recording.cells.map((cell) => [cell.cellKey, cell.calls]));
		expect(byKey(joined)).toEqual(byKey(whole));
		// Recording a trial again replaces it rather than doubling it.
		await record(file, { trials: 2, trial: 1 }, 'passes-1-again');
		expect((await read(passes)).cells.length).toBe(whole.cells.length);
	});

	it('refuses to add a trial recorded from another design, and a trial the design does not ask for', async () => {
		const target = join(root, 'refused.provider-cassette.json');
		const file = await designFile('refused', target);
		await record(file, { trials: 2, trial: 0 }, 'refused-0');
		// Another population size is another design: its campaigns' digests differ.
		await expect(record(file, { trials: 2, trial: 1, size: 40 }, 'refused-1')).rejects.toThrow(
			/another design/
		);
		await expect(record(file, { trials: 2, trial: 2 }, 'refused-2')).rejects.toThrow(
			/outside the 2 trial/
		);
	});
});
