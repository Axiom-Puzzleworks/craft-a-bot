import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../cli.js';
import { createRegistry, defaultConfig } from '../config.js';
import { credentialVariable, credentialsFromEnv } from '../credentials.js';
import { benchmarkRun, cassetteFileFor } from './benchmark.js';
import { SMOKE_VARIABLES, keysCheck, refuseSecrets, renderKeys } from './keys.js';

/**
 * **`craftabot keys check` and the recorders' gate** (WP162,
 * `112-REAL-ENOUGH-PLAN.md` §5, D9): which credentials a process holds, by id;
 * the secrets the harness scrubs (the smoke variables and each half of an AWS
 * pair, not only `CRAFTABOT_CREDENTIAL_*`); a recorder refusing to write what
 * holds one; and `.env.example` and `docs/keys.md` kept equal to what the
 * installed packs declare, so neither can drift.
 */
const ROOT = resolve(import.meta.dirname, '../../../..');
const registry = createRegistry(defaultConfig());
const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

describe('keysCheck', () => {
	it('lists every credential the installed content declares, with what it lights', () => {
		const report = keysCheck(registry, {});
		const ids = report.credentials.map((row) => row.id);
		for (const id of [
			'openai',
			'anthropic',
			'gemini',
			'geap',
			'azure-content-safety',
			'aws-bedrock',
			'lakera',
			'aws-verified-permissions',
			'evidence-supabase'
		])
			expect(ids, id).toContain(id);
		const geap = report.credentials.find((row) => row.id === 'geap')!;
		expect(geap.variable).toBe('CRAFTABOT_CREDENTIAL_GEAP');
		expect(geap.lights).toEqual(
			expect.arrayContaining(['guard geap/model-armor', 'evaluator geap/eval/rubric'])
		);
		expect(report.credentials.every((row) => !row.held)).toBe(true);
		// A keyless provider is not a credential.
		expect(ids).not.toContain('ollama');
	});

	it('says what is held by id, never by value, and notes a smoke key with no harness credential', () => {
		const planted = {
			CRAFTABOT_CREDENTIAL_OPENAI: 'sk-planted-openai-0123456789abcdef',
			OPENAI_API_KEY: 'sk-planted-smoke-0123456789abcdef',
			LAKERA_GUARD_KEY: 'lak-planted-0123456789abcdef',
			GEAP_PROJECT_ID: 'a-project'
		};
		const report = keysCheck(registry, planted);
		expect(report.credentials.find((row) => row.id === 'openai')?.held).toBe(true);
		expect(report.credentials.find((row) => row.id === 'geap')?.held).toBe(false);
		expect(report.smoke.find((row) => row.variable === 'OPENAI_API_KEY')?.set).toBe(true);
		// Lakera: the smoke key is set, the harness credential is not.
		expect(report.notes.join('\n')).toContain(
			'LAKERA_GUARD_KEY is set but CRAFTABOT_CREDENTIAL_LAKERA is not'
		);
		// OpenAI has both: no note.
		expect(report.notes.join('\n')).not.toContain('OPENAI_API_KEY is set but');
		// A half-set smoke script is named, and a typo'd credential is too.
		expect(report.notes.join('\n')).toContain('smoke:geap is partly set');
		expect(
			keysCheck(registry, { CRAFTABOT_CREDENTIAL_LAKERRA: 'x-typo-0123456789' }).notes.join('\n')
		).toContain('CRAFTABOT_CREDENTIAL_LAKERRA is set but no installed content declares');
		const text = renderKeys(report);
		for (const value of Object.values(planted)) expect(text).not.toContain(value);
		expect(JSON.stringify(report)).not.toContain('planted');
	});

	it('the CLI prints the table and the JSON, and the key never prints', async () => {
		const env = { CRAFTABOT_CREDENTIAL_GEAP: 'ya29.planted-geap-token-0123456789' };
		let out = '';
		const io = {
			stdout: (t: string) => void (out += t),
			stderr: (t: string) => void (out += t),
			env
		};
		expect(await main(['keys', 'check'], io)).toBe(0);
		expect(out).toContain('held     CRAFTABOT_CREDENTIAL_GEAP');
		expect(out).toContain('missing  CRAFTABOT_CREDENTIAL_OPENAI');
		expect(out).not.toContain('planted');
		out = '';
		expect(await main(['keys', 'check', '--json'], io)).toBe(0);
		expect(JSON.parse(out).credentials.length).toBeGreaterThan(8);
		expect(out).not.toContain('planted');
		out = '';
		expect(await main(['keys', 'nope'], io)).toBe(1);
		expect(out).toContain('keys needs check');
	});
});

describe('the secrets the harness holds', () => {
	it('include the smoke secrets and each half of an AWS pair, but not a configuration value', () => {
		const secrets = credentialsFromEnv({
			CRAFTABOT_CREDENTIAL_OPENAI: 'sk-planted-openai-0123456789abcdef',
			OPENAI_API_KEY: 'sk-planted-smoke-0123456789abcdef',
			GEAP_ACCESS_TOKEN: 'ya29.planted-geap-token-0123456789',
			AZURE_CONTENT_SAFETY_KEY: 'azure-planted-key-0123456789',
			LAKERA_GUARD_KEY: 'lakera-planted-key-0123456789',
			CRAFTABOT_CREDENTIAL_AWS_BEDROCK: 'AKIAPLANTEDEXAMPL:plantedSecretAccessKey0123456789abcdef',
			CRAFTABOT_CREDENTIAL_AWS_VERIFIED_PERMISSIONS: 'AKIASHORT:tiny',
			AWS_BEDROCK_REGION: 'eu-west-2',
			GEAP_PROJECT_ID: 'a-project-id'
		}).secrets();
		expect(secrets).toEqual(
			expect.arrayContaining([
				'sk-planted-openai-0123456789abcdef',
				'sk-planted-smoke-0123456789abcdef',
				'ya29.planted-geap-token-0123456789',
				'azure-planted-key-0123456789',
				'lakera-planted-key-0123456789',
				'AKIAPLANTEDEXAMPL:plantedSecretAccessKey0123456789abcdef',
				'AKIAPLANTEDEXAMPL',
				'plantedSecretAccessKey0123456789abcdef'
			])
		);
		// A short part would blank ordinary words, so only the whole pair is held; configuration is not a secret.
		expect(secrets).not.toContain('tiny');
		expect(secrets).not.toContain('eu-west-2');
		expect(secrets).not.toContain('a-project-id');
	});
});

describe('a recorder refuses to write what holds a credential', () => {
	it('refuseSecrets names what it refused and never the secret', () => {
		const secret = 'sk-planted-recorder-0123456789abcdef';
		expect(() =>
			refuseSecrets({ body: `the key is ${secret}` }, [secret], 'the x cassette')
		).toThrow(
			'refusing to write the x cassette: it contains a credential this process holds. Nothing was written.'
		);
		try {
			refuseSecrets({ body: secret }, [secret], 'the x cassette');
		} catch (error) {
			expect(String(error)).not.toContain(secret);
		}
		expect(() => refuseSecrets({ body: 'clean' }, [secret], 'the x cassette')).not.toThrow();
	});

	it('benchmark run --record refuses a response that echoed a key inside its body, and writes nothing', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'craftabot-keys-'));
		roots.push(dir);
		const benchmark = JSON.parse(
			await readFile(join(ROOT, 'benchmarks', 'bank-adversarial.json'), 'utf8')
		) as Record<string, unknown>;
		const file = join(dir, 'azure.json');
		await writeFile(
			file,
			JSON.stringify({
				...benchmark,
				id: 'azure-leak',
				corpora: ['fs-disputes/corpus/adversarial-v1'],
				subjects: { services: ['azure-content-safety/content-safety'], readers: [], components: [] }
			})
		);
		const secret = 'az-planted-echoed-secret-0123456789';
		// A vendor stand-in that echoes the caller's key inside a larger string — which the exact-match scrub does not catch.
		const echo = (async () =>
			new Response(
				JSON.stringify({
					blocklistsMatch: [],
					categoriesAnalysis: [],
					userPromptAnalysis: { attackDetected: false, detail: `request had key ${secret} in it` },
					documentsAnalysis: []
				}),
				{ status: 200 }
			)) as unknown as typeof globalThis.fetch;
		const attempt = benchmarkRun({
			file,
			registry,
			credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_AZURE_CONTENT_SAFETY: secret }),
			cassettes: dir,
			record: true,
			fetch: echo,
			ranAt: '2026-10-03T12:00:00.000Z'
		});
		await expect(attempt).rejects.toThrow(
			/refusing to write the azure-content-safety\/content-safety cassette/
		);
		await attempt.catch((error: unknown) => expect(String(error)).not.toContain(secret));
		expect(existsSync(cassetteFileFor(dir, 'azure-content-safety/content-safety'))).toBe(false);
	}, 120_000);
});

describe('.env.example and docs/keys.md say what the installed packs declare', () => {
	const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
	const doc = readFileSync(join(ROOT, 'docs', 'keys.md'), 'utf8');
	const named = (text: string, name: string): boolean =>
		new RegExp(`^#?\\s*${name}=`, 'm').test(text) || text.includes(`\`${name}\``);

	it('names every credential variable a pack declares, and every smoke variable', () => {
		const report = keysCheck(registry, {});
		for (const row of report.credentials)
			expect(named(example, row.variable), `${row.variable} in .env.example`).toBe(true);
		for (const entry of SMOKE_VARIABLES)
			expect(named(example, entry.variable), `${entry.variable} in .env.example`).toBe(true);
	});

	it('the doc names each of them too, with its script', () => {
		const report = keysCheck(registry, {});
		for (const row of report.credentials) {
			const bare = row.variable.replace(/^CRAFTABOT_CREDENTIAL_/, '');
			expect(
				doc.includes(row.variable) || doc.includes(`…_${bare.split('_').pop()}`),
				row.variable
			).toBe(true);
		}
		for (const entry of SMOKE_VARIABLES) {
			expect(doc, entry.variable).toContain(entry.variable);
			expect(doc, entry.script).toContain(entry.script);
		}
		// Every id maps to the variable the harness will read.
		expect(credentialVariable('azure-content-safety')).toBe(
			'CRAFTABOT_CREDENTIAL_AZURE_CONTENT_SAFETY'
		);
	});
});

describe('a placeholder where a smoke key should be (2026-10-06)', () => {
	// A three-character LAKERA_GUARD_KEY in a .env matched ordinary words in a live recording, and the recorder refused to
	// write 28 minutes of cassette. A vendor's key is thirty characters or more; a value this short is a placeholder.
	const env = { LAKERA_GUARD_KEY: 'xyz', OPENAI_API_KEY: 'sk-planted-smoke-0123456789abcdef' };

	it('is neither scrubbed nor refused on, and a real key beside it still is', () => {
		const secrets = credentialsFromEnv(env).secrets();
		expect(secrets).toContain('sk-planted-smoke-0123456789abcdef');
		expect(secrets).not.toContain('xyz');
		expect(() => refuseSecrets({ text: 'the xyz of it' }, secrets, 'a cassette')).not.toThrow();
		expect(() =>
			refuseSecrets({ text: 'echoed sk-planted-smoke-0123456789abcdef' }, secrets, 'a cassette')
		).toThrow(/credential/);
	});

	it('is said by keys check, naming the variable and how long it is, and never its value', () => {
		const notes = keysCheck(createRegistry(defaultConfig()), env).notes.join('\n');
		expect(notes).toContain('LAKERA_GUARD_KEY is set but only 3 characters');
		expect(notes).not.toContain('xyz');
		expect(notes).not.toContain('sk-planted');
	});
});
