import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseTraceBundle, verifyBundleDigest, type EvidenceItem } from '@craftabot/core';
import { makeAgent, makeEvent, makeRun } from '@craftabot/core/testing';
import { memoryEvidenceStore, resetMemoryEvidence } from '@craftabot/evidence';
import { main } from '../cli.js';
import { createFileStorage } from '../storage/file-storage.js';
import { snackbotKit } from '../testing/kit-fixture.js';
import { pullEvidence, pulledPathFor } from './evidence.js';

/**
 * **`craftabot evidence push|pull`** (`58-EVIDENCE-STORE.md` §4.4, §11 items
 * 2 and 6, WP70): over the memory store — a run pushed lands as its bundle
 * and pulls back verified into a file the Workshop imports; a campaign
 * report, the assurance pack and a content record push as their kinds;
 * a tampered item is refused on pull and the command exits 1; an unknown
 * store, a bad config and a missing target are refused before any call.
 */
const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-evidence-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});
beforeEach(() => resetMemoryEvidence());

function io(env: NodeJS.ProcessEnv = {}) {
	const sink = {
		out: '',
		err: '',
		env,
		stdout: (t: string) => void (sink.out += t),
		stderr: (t: string) => void (sink.err += t)
	};
	return sink;
}
const MEMORY = ['--store', 'evidence/memory', '--store-config', '{"workspace":"t"}'];

describe('craftabot evidence (WP70)', () => {
	it('pushes a run as its bundle, prints the receipt, and pulls it back verified as a bundle file', async () => {
		const root = await tmp();
		const out = join(root, 'runs');
		const kitPath = join(root, 'bot.craftabot.json');
		await writeFile(kitPath, JSON.stringify(snackbotKit()), 'utf8');
		const run = io();
		expect(
			await main(['run', '--kit', kitPath, '--brain', 'scripted-optimal', '--out', out], run)
		).toBe(0);
		const runId = (await (await createFileStorage(out)).listRuns())[0]?.id as string;

		const push = io({ CRAFTABOT_PRINCIPAL: 'tester' });
		expect(await main(['evidence', 'push', ...MEMORY, '--run', runId, '--out', out], push)).toBe(0);
		const receipt = JSON.parse(push.out) as { kind: string; id: string; digest: string };
		expect(receipt).toMatchObject({ storeId: 'evidence/memory', kind: 'bundle', id: runId });

		const dir = join(root, 'evidence');
		const pull = io();
		expect(
			await main(['evidence', 'pull', ...MEMORY, '--kind', 'bundle', '--dir', dir], pull)
		).toBe(0);
		expect(pull.out).toContain(`verified bundle          ${runId}`);
		const file = pulledPathFor(dir, { kind: 'bundle', id: runId });
		const bundle = parseTraceBundle(JSON.parse(await readFile(file, 'utf8')));
		expect(await verifyBundleDigest(bundle)).toBe(true);
		expect(bundle.runs[0]?.run.id).toBe(runId);
	});

	it('pushes a campaign report, the assurance pack and a content record as their kinds', async () => {
		const root = await tmp();
		const out = join(root, 'runs');
		const storage = await createFileStorage(out);
		const run = makeRun();
		await storage.putAgent(makeAgent({ id: run.agentId }));
		await storage.putRun(run);
		await storage.appendEvents(run.id, [makeEvent(run.id, 0, 1)]);
		await storage.putCampaignReport({
			id: 'report-1',
			campaignId: 'c',
			title: 'A report',
			createdAt: '2026-01-01T00:00:00.000Z',
			passed: true,
			gatesPassed: 1,
			gatesTotal: 1,
			cells: 1,
			report: {},
			schemaVersion: 1
		});
		const contentFile = join(root, 'card.json');
		await writeFile(
			contentFile,
			JSON.stringify({
				id: 'local/campaigns/mine',
				kind: 'campaign',
				title: 'Mine',
				record: { id: 'local/campaigns/mine' },
				savedAt: '2026-01-01T00:00:00.000Z',
				schemaVersion: 1
			}),
			'utf8'
		);
		const report = io();
		expect(
			await main(
				['evidence', 'push', ...MEMORY, '--campaign-report', 'report-1', '--out', out],
				report
			)
		).toBe(0);
		expect(JSON.parse(report.out)).toMatchObject({ kind: 'campaign-report', id: 'report-1' });
		const pack = io();
		expect(
			await main(
				['evidence', 'push', ...MEMORY, '--assurance', '--agent', run.agentId, '--out', out],
				pack
			),
			pack.err
		).toBe(0);
		expect(JSON.parse(pack.out)).toMatchObject({ kind: 'assurance-pack' });
		expect((JSON.parse(pack.out) as { id: string }).id).toMatch(/^assurance\//);
		const content = io();
		expect(
			await main(
				['evidence', 'push', ...MEMORY, '--content-file', contentFile, '--out', out],
				content
			)
		).toBe(0);
		expect(JSON.parse(content.out)).toMatchObject({ kind: 'content', id: 'local/campaigns/mine' });

		const dir = join(root, 'evidence');
		const pull = io();
		expect(await main(['evidence', 'pull', ...MEMORY, '--dir', dir], pull)).toBe(0);
		expect(pull.out.split('\n').filter(Boolean)).toHaveLength(3);
		const pulledContent = JSON.parse(
			await readFile(pulledPathFor(dir, { kind: 'content', id: 'local/campaigns/mine' }), 'utf8')
		) as { title: string };
		expect(pulledContent.title).toBe('Mine');
	});

	it('refuses a tampered item on pull, writes nothing for it, and exits 1', async () => {
		const root = await tmp();
		const instance = memoryEvidenceStore.create({
			config: { workspace: 't' },
			fetch: globalThis.fetch,
			getCredential: () => undefined
		});
		const good: EvidenceItem = {
			kind: 'campaign-report',
			id: 'report-1',
			digest: 'a'.repeat(64),
			pushedAt: '2026-01-01T00:00:00.000Z',
			payload: {
				id: 'report-1',
				campaignId: 'c',
				title: 'A report',
				createdAt: '2026-01-01T00:00:00.000Z',
				passed: true,
				gatesPassed: 1,
				gatesTotal: 1,
				cells: 1,
				report: {},
				schemaVersion: 1
			}
		};
		await instance.push(good);
		const dir = join(root, 'evidence');
		const pulled = await pullEvidence({ instance, query: {}, dir });
		expect(pulled).toEqual([
			{ kind: 'campaign-report', id: 'report-1', digest: 'a'.repeat(64), verified: false }
		]);
		await expect(readFile(pulledPathFor(dir, good), 'utf8')).rejects.toThrow();
		const cli = io();
		expect(await main(['evidence', 'pull', ...MEMORY, '--dir', dir], cli)).toBe(1);
		expect(cli.out).toContain('REFUSED');
	});

	it('refuses an unknown store, a config the store rejects, a bad kind and a push with no target', async () => {
		const unknown = io();
		expect(
			await main(['evidence', 'push', '--store', 'evidence/nowhere', '--run', 'x'], unknown)
		).toBe(1);
		expect(unknown.err).toContain('unknown evidence store');
		const config = io();
		expect(
			await main(
				[
					'evidence',
					'push',
					'--store',
					'evidence/supabase',
					'--store-config',
					'{"url":"nope"}',
					'--run',
					'x'
				],
				config
			)
		).toBe(1);
		expect(config.err).toContain('evidence/supabase config');
		const kind = io();
		expect(await main(['evidence', 'pull', ...MEMORY, '--kind', 'runs'], kind)).toBe(1);
		expect(kind.err).toContain('--kind wants');
		const none = io();
		expect(await main(['evidence', 'push', ...MEMORY], none)).toBe(1);
		expect(none.err).toContain('needs one of');
		const verb = io();
		expect(await main(['evidence', 'list', ...MEMORY], verb)).toBe(1);
		expect(verb.err).toContain('push|pull');
	});
});
