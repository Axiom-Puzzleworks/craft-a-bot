import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseProviderRecording, type ProviderRecordingFile } from '@craftabot/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { probePrompts, readPrompts } from './probe.js';
import { recordExperiment } from './record-provider.js';
import { compareRecordings, decidedCalls, itemOfKey, reperform } from './reperform.js';

/**
 * **`craftabot reperform`** (WP192, `113-RECORDING-AND-RELIABILITY.md` §4.8)
 * and `probe prompts`: the lending stack design recorded twice over through
 * the mock provider, then performed again. The mock repeats itself exactly, so
 * the honest reading is 100% on every measure — and a recording tampered with
 * in one place reads exactly that place: the item that moved, the tick it
 * moved at. A moved design is refused by name; `--allow-drift` says otherwise
 * and the report carries it.
 */
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

describe('reperform and probe prompts (WP192)', () => {
	let root: string;
	let file: string;
	let recordingPath: string;
	let original: ProviderRecordingFile;

	const common = () => ({
		config: defaultConfig(),
		credentials: credentialsFromEnv({}),
		size: 60,
		now: fixedNow(),
		newId: fixedIds(),
		clock: () => 0
	});

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), 'craftabot-reperform-'));
		roots.push(root);
		recordingPath = join(root, 'lending.provider-cassette.json');
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
			trials: 2,
			...common()
		});
		original = parseProviderRecording(JSON.parse(await readFile(recordingPath, 'utf8')));
	});

	const run = (name: string, extra: Record<string, unknown> = {}) =>
		reperform({
			recording: recordingPath,
			file,
			provider: 'mock',
			trials: 2,
			out: join(root, name),
			...common(),
			...extra
		});

	it('performed again by a model that repeats itself, reads 100% on every measure', async () => {
		const report = await run('same');
		expect(report.drifted).toEqual([]);
		expect(report.items).toBe(new Set(original.cells.map((cell) => itemOfKey(cell.cellKey))).size);
		expect(report.originalTrials).toBe(2);
		expect(report.freshTrials).toBe(2);
		expect(report.outcomeAgreement.value).toBe(1);
		expect(report.firstTick.sameCall.value).toBe(1);
		expect(report.firstTick.sameWords.value).toBe(1);
		expect(report.divergence.identicalPaths.value).toBe(1);
		expect(report.divergence.medianFirstDivergence).toBeNull();
		expect(report.divergence.meanPathDistance).toBe(0);
		expect(report.withinFresh?.outcomeAgreement.value).toBe(1);
		expect(report.disagreements).toEqual([]);
		// The fresh performances are a recording of their own, beside the original, which is untouched.
		const fresh = parseProviderRecording(JSON.parse(await readFile(report.recordingFile, 'utf8')));
		expect(fresh.cells.length).toBe(original.cells.length);
		expect(JSON.parse(await readFile(recordingPath, 'utf8'))).toEqual(original);
	});

	it('reads exactly where a recording moved: the item that disagrees, and the tick its path forked at', () => {
		const tampered = structuredClone(original);
		const target = tampered.cells.find((cell) => decidedCalls(cell.calls).length >= 2)!;
		target.outcome = 'SOMETHING-ELSE';
		const calls = target.calls.filter((call) => call.role === 'agent' && call.response);
		// The second decision was another call.
		calls[1]!.response!.toolCall = { name: 'a-different-tool', arguments: {} };
		const compared = compareRecordings(tampered, original);
		expect(compared.outcomeAgreement.value).toBeLessThan(1);
		expect(compared.divergence.identicalPaths.value).toBeLessThan(1);
		expect(compared.divergence.medianFirstDivergence).toBe(1);
		expect(compared.divergence.meanPathDistance).toBeGreaterThan(0);
		// The first tick was untouched, so the first call and words still repeat everywhere.
		expect(compared.firstTick.sameCall.value).toBe(1);
		expect(compared.disagreements[0]?.item).toBe(itemOfKey(target.cellKey));
		expect(compared.disagreements[0]?.original).toContain('SOMETHING-ELSE');
	});

	it('refuses a moved design by name, and says so in the report when told to go on', async () => {
		await expect(run('drift', { size: 40 })).rejects.toThrow(
			/not the ones recorded.*--allow-drift/
		);
		const report = await run('drift-allowed', { size: 40, allowDrift: true });
		expect(report.drifted.length).toBeGreaterThan(0);
	});

	it('performs only the items it is asked to: by name, and by count taken evenly', async () => {
		const items = [...new Set(original.cells.map((cell) => itemOfKey(cell.cellKey)))];
		const one = items[0]!;
		const named = await run('named', { cells: one });
		expect(named.items).toBe(1);
		const limited = await run('limited', { limit: 3 });
		expect(limited.items).toBe(3);
		await expect(run('none', { cells: 'no-such-item' })).rejects.toThrow(/no recorded item/);
	});

	it('takes real first-tick prompts from a recording that stores only digests', async () => {
		const promptsFile = join(root, 'probe', 'prompts.json');
		const taken = await probePrompts({
			recording: recordingPath,
			file,
			count: 4,
			out: join(root, 'probe-replay'),
			promptsFile,
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			size: 60,
			trials: 2
		});
		expect(taken.prompts).toBe(4);
		const requests = await readPrompts(promptsFile);
		expect(requests).toHaveLength(4);
		for (const request of requests) {
			expect(request.messages.length).toBeGreaterThan(0);
			expect(request.messages[0]?.role).toBe('system');
			expect(typeof request.maxTokens).toBe('number');
		}
		await expect(readPrompts(join(root, 'absent.json'))).rejects.toThrow();
	});
});
