import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assurancePackFromStorage } from '@craftabot/governance/reports';
import { afterAll, describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { snackbotKit } from '../testing/kit-fixture.js';
import { assuranceReportFrom, reportAssurance } from './assurance.js';
import { runKit } from './run.js';

const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

const config = defaultConfig();
const credentials = credentialsFromEnv({});
const NOW = () => '2026-09-06T12:00:00.000Z';

async function storeWithRuns() {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-assurance-'));
	roots.push(root);
	const kitPath = join(root, 'bot.craftabot.json');
	await writeFile(kitPath, JSON.stringify(snackbotKit()), 'utf8');
	const out = join(root, 'runs');
	const base = { kitPath, seed: 1, out, config, credentials } as const;
	const ok = await runKit({ ...base, brain: 'scripted-optimal' });
	const noisy = await runKit({ ...base, brain: 'scripted-noisy', seed: 5, card: 'starter/snack' });
	return { out, ok, noisy, storage: await createFileStorage(out) };
}

describe('craftabot assurance', () => {
	it('emits the pack /workshop/assurance renders for the same bot, with its two renderings', async () => {
		const { storage, ok } = await storeWithRuns();
		const registry = createRegistry(config);
		const { pack, markdown, html } = await reportAssurance(storage, registry, ok.agentId, {
			now: NOW
		});
		// What the Workshop does, with the same inputs from the same store.
		const screen = await assurancePackFromStorage(ok.agentId, storage, registry, {
			parseReport: assuranceReportFrom,
			now: NOW
		});
		expect(pack).toEqual(screen);
		expect(pack.runs).toHaveLength(2);
		expect(pack.development.note).toContain('no campaign evidence');
		expect(pack.controlMaps.map((map) => map.id)).toContain('governance/control-map');
		expect(pack.controlMaps.map((map) => map.id)).toContain('fs-bank/control-map');
		expect(pack.review.pending).toBe(0);
		expect(markdown).toContain(`# Assurance pack — ${pack.bot.name}`);
		expect(html).toContain('<!doctype html>');
		expect(html).toContain(pack.digest);

		// The only bot in the store needs no id.
		expect((await reportAssurance(storage, registry, undefined, { now: NOW })).pack).toEqual(
			screen
		);
		await expect(reportAssurance(storage, registry, 'nobody')).rejects.toThrow(/no bot 'nobody'/);
	});

	it('a stored report that no longer parses is skipped, never fabricated', () => {
		expect(assuranceReportFrom({ not: 'a report' })).toBeUndefined();
	});
});
