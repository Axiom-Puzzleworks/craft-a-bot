import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig } from './config.js';
import { credentialsFromEnv } from './credentials.js';
import { snackbotKit } from './testing/kit-fixture.js';
import { runKit } from './commands/run.js';
import { main } from './cli.js';

/**
 * **The harness's key-leak gate** (hard rule 2, WP37 stage B) — the
 * workbench's `key-leak.test.ts` for a host with no browser. One secret is
 * planted for every credential the default config declares (each provider
 * that needs a key, and the Armour Brick's own), a run is made and bundled,
 * and every file the harness wrote — and everything it printed — is swept
 * for every secret. A brain that needs no key still runs with the secrets
 * *present in the environment*, which is precisely the case that leaks by
 * accident: the key is there, and nothing should touch it.
 */
const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

const PLANTED = {
	CRAFTABOT_CREDENTIAL_OPENAI: 'sk-planted-openai-0123456789abcdef',
	CRAFTABOT_CREDENTIAL_ANTHROPIC: 'sk-ant-planted-0123456789abcdef',
	CRAFTABOT_CREDENTIAL_GEMINI: 'AIzaPlantedGemini0123456789',
	CRAFTABOT_CREDENTIAL_GEAP: 'ya29.planted-geap-token-0123456789'
};

async function everyFileUnder(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await everyFileUnder(path)));
		else files.push(path);
	}
	return files;
}

describe('the harness never writes or prints a credential', () => {
	it('plants one secret per declared credential and sweeps every file and every line of output', async () => {
		const root = await mkdtemp(join(tmpdir(), 'craftabot-leak-'));
		roots.push(root);
		const kitPath = join(root, 'bot.craftabot.json');
		await writeFile(kitPath, JSON.stringify(snackbotKit()), 'utf8');
		const out = join(root, 'runs');

		const credentials = credentialsFromEnv(PLANTED);
		// Every declared credential is planted — the sweep is only as good as its list.
		expect(credentials.secrets()).toHaveLength(Object.keys(PLANTED).length);

		let printed = '';
		const io = {
			env: PLANTED,
			stdout: (text: string) => void (printed += text),
			stderr: (text: string) => void (printed += text)
		};

		const report = await runKit({
			kitPath,
			brain: 'scripted-optimal',
			seed: 1,
			out,
			config: defaultConfig(),
			credentials
		});
		expect(
			await main(
				['bundle', '--run', report.runId, '--out', out, '--file', join(root, 'bundle.json')],
				io
			)
		).toBe(0);
		expect(await main(['packs'], io)).toBe(0);
		// A live run that fails before any network call still must not echo the key.
		expect(
			await main(
				['run', '--kit', kitPath, '--brain', 'live', '--provider', 'anthropic', '--out', out],
				io
			)
		).toBe(1);

		const files = await everyFileUnder(root);
		expect(files.length).toBeGreaterThan(4);
		for (const file of files) {
			const text = await readFile(file, 'utf8');
			for (const secret of credentials.secrets()) {
				expect(text, `${file} contains a planted secret`).not.toContain(secret);
			}
		}
		for (const secret of credentials.secrets()) {
			expect(printed, 'the CLI printed a planted secret').not.toContain(secret);
		}
	});
});
