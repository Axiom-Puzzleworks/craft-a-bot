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
	CRAFTABOT_CREDENTIAL_GEAP: 'ya29.planted-geap-token-0123456789',
	// WP70 (`58-…` §4.4): the evidence store's workspace token.
	CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE: 'eyJ.planted-workspace-token.0123456789',
	// WP162 (`112-REAL-ENOUGH-PLAN.md` §5): the live smoke scripts' own secrets, and an AWS key pair (each half is scrubbed too).
	OPENAI_API_KEY: 'sk-planted-smoke-openai-0123456789abcdef',
	GEAP_ACCESS_TOKEN: 'ya29.planted-smoke-geap-token-0123456789',
	AZURE_CONTENT_SAFETY_KEY: 'azure-planted-smoke-key-0123456789',
	LAKERA_GUARD_KEY: 'lakera-planted-smoke-key-0123456789',
	CRAFTABOT_CREDENTIAL_AWS_BEDROCK: 'AKIAPLANTEDEXAMPL:plantedBedrockSecretAccessKey0123456789'
};
/** The anon key is configuration, publishable by design — planted all the same (`58-…` §2 item 4). */
const PLANTED_ANON_KEY = 'sb_publishable_planted_anon_0123456789';

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
		expect(credentials.secrets().length).toBeGreaterThanOrEqual(Object.keys(PLANTED).length);

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
		// The story (WP161): told in every format from the same run, redacted against every secret held.
		for (const format of ['markdown', 'html', 'json'] as const)
			expect(
				await main(
					[
						'story',
						report.runId,
						'--store',
						out,
						'--format',
						format,
						'--out',
						join(root, `story.${format}`)
					],
					io
				)
			).toBe(0);
		// The OTel spans (WP162): the run as a trace file for a collector, swept like every other file.
		expect(
			await main(
				[
					'export',
					'--run',
					report.runId,
					'--sink',
					'telemetry/file',
					'--sink-config',
					JSON.stringify({ path: join(root, 'spans.jsonl') }),
					'--out',
					out
				],
				io
			)
		).toBe(0);
		// And the keys check, which names credentials by id and must never say one.
		expect(await main(['keys', 'check'], io)).toBe(0);
		expect(await main(['keys', 'check', '--json'], io)).toBe(0);
		expect(await main(['packs'], io)).toBe(0);
		// A push and a pull refused by the egress guard (WP70): neither may echo the token or the anon key.
		const storeConfig = JSON.stringify({
			url: 'https://planted-ref.supabase.co',
			anonKey: PLANTED_ANON_KEY,
			workspace: 'leak-sweep'
		});
		const evidenceArgs = [
			'--store',
			'evidence/supabase',
			'--store-config',
			storeConfig,
			'--egress',
			'none'
		];
		expect(
			await main(['evidence', 'push', ...evidenceArgs, '--run', report.runId, '--out', out], io)
		).toBe(1);
		expect(
			await main(['evidence', 'pull', ...evidenceArgs, '--dir', join(root, 'evidence')], io)
		).toBe(1);
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
		for (const secret of [...credentials.secrets(), PLANTED_ANON_KEY]) {
			expect(printed, 'the CLI printed a planted secret').not.toContain(secret);
		}
	});
});
