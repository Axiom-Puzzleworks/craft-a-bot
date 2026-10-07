import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseProviderRecording, type ProviderRecordingFile } from '@craftabot/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
