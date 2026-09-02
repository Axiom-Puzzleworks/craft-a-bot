import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeContent } from '@craftabot/core/testing';
import { parseCampaignReport } from '@craftabot/evals';
import { main } from '../cli.js';
import { createRegistry, defaultConfig } from '../config.js';
import { addContent, contentPathFor, listContent, renderContent } from './content.js';

const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-content-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

function io() {
	const sink = {
		out: '',
		err: '',
		env: {} as NodeJS.ProcessEnv,
		stdout: (t: string) => void (sink.out += t),
		stderr: (t: string) => void (sink.err += t)
	};
	return sink;
}

describe('craftabot content (WP46)', () => {
	it('adds a record under its own id and lists it back', async () => {
		const root = await tmp();
		const dir = join(root, 'content');
		const file = join(root, 'card.json');
		await writeFile(file, JSON.stringify(makeContent()), 'utf8');
		const record = await addContent(dir, file);
		expect(record.id).toBe('local/policy/no-shouting');
		expect(contentPathFor(dir, record.id)).toBe(join(dir, 'policy', 'no-shouting.json'));
		expect(JSON.parse(await readFile(contentPathFor(dir, record.id), 'utf8'))).toEqual(record);
		expect((await listContent(dir)).map((r) => r.id)).toEqual(['local/policy/no-shouting']);
		expect(renderContent(await listContent(dir))).toContain('policy-card');
		expect(renderContent([])).toBe('no authored content\n');
		// A file that is not a record is refused.
		await writeFile(file, JSON.stringify({ id: 'starter/policy/x' }), 'utf8');
		await expect(addContent(dir, file)).rejects.toThrow();
	});

	it('the registry carries the local pack, empty or not', () => {
		expect(
			createRegistry(defaultConfig())
				.listPacks()
				.map((p) => p.id)
		).toContain('local');
		const registry = createRegistry({ ...defaultConfig(), content: [makeContent()] });
		expect(registry.getPolicyCard('local/policy/no-shouting')?.title).toBe('No shouting');
	});

	it('the CLI adds and lists, and a campaign names a local card through --content', async () => {
		const root = await tmp();
		const dir = join(root, 'content');
		const file = join(root, 'card.json');
		await writeFile(file, JSON.stringify(makeContent()), 'utf8');
		const added = io();
		expect(await main(['content', 'add', '--file', file, '--content', dir], added)).toBe(0);
		expect(added.out).toContain('added policy-card local/policy/no-shouting');
		const listed = io();
		expect(await main(['content', 'list', '--content', dir], listed)).toBe(0);
		expect(listed.out).toContain('local/policy/no-shouting');

		const campaign = join(root, 'campaign.json');
		await writeFile(
			campaign,
			JSON.stringify({
				schemaVersion: 1,
				id: 'local-card',
				title: 'A local card in a campaign',
				scenarios: [{ id: 'hello', goalCardId: 'starter/say-hello' }],
				builds: [
					{
						id: 'quiet',
						base: { kind: 'starter-default' },
						overrides: {
							safety: {
								maxTicks: 8,
								blockedActions: [],
								approvalMode: false,
								policyCards: ['local/policy/no-shouting']
							}
						}
					}
				],
				guards: [{ id: 'none' }],
				brains: [{ id: 'optimal', tier: 'scripted-optimal' }],
				seeds: [1],
				gates: [
					{
						id: 'quiet-holds',
						require: { kind: 'outcome-rate', outcome: 'SUCCESS', atMost: 1 }
					}
				]
			}),
			'utf8'
		);
		const out = join(root, 'out');
		const ran = io();
		expect(
			await main(
				['campaign', '--file', campaign, '--out', out, '--content', dir, '--no-keep-runs'],
				ran
			)
		).toBe(0);
		expect(ran.err).toBe('');
		const reportFile = ran.out.match(/report\s+(\S+)/)?.[1] ?? '';
		const report = parseCampaignReport(JSON.parse(await readFile(reportFile, 'utf8')));
		expect(report.cells).toHaveLength(1);
		expect(report.cells[0]?.error).toBeUndefined();
		// The card blocks every `say`, so the greeting never lands.
		expect(report.cells[0]?.outcome).not.toBe('SUCCESS');
	});

	it('names what the command needs', async () => {
		const sink = io();
		await expect(main(['content', 'add'], sink)).resolves.not.toBe(0);
		expect(sink.err).toContain('content add needs --file');
		const other = io();
		await expect(main(['content', 'frobnicate'], other)).resolves.not.toBe(0);
		expect(other.err).toContain('unknown verb');
	});
});
