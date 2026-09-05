import { parseCassetteFile, type PackManifest, type ServiceLine } from '@craftabot/core';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../cli.js';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { cassetteFileName, recordCassette } from './record.js';

/**
 * `craftabot record` (WP58 stage B, `47-…` §4.2): a live line recorded under
 * an egress guard that allows its own hosts only, to a cassette redacted
 * against every planted secret — the harness's key-leak gate, applied to a
 * recording. The line is a stub whose `call` echoes its credential into the
 * result, which is exactly what a leak would look like.
 */
const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-record-'));
	roots.push(root);
	return root;
}

const SECRET = 'acme-planted-key-DO-NOT-LEAK-5b1c';

const echoLine: ServiceLine = {
	id: 'acme/echo',
	name: 'the echo line',
	description: 'Echoes what it is sent, and its key.',
	operations: [{ id: 'say', name: 'Say', description: 'Say.', riskTier: 'observe' }],
	live: {
		egress: [{ host: 'echo.example.test', purpose: 'echoes', sends: ['decision'] }],
		credential: { id: 'acme', name: 'Acme key', kind: 'api-key' },
		async call(op, args, deps) {
			const key = deps.getCredential('acme') ?? '';
			const response = await deps.fetch(`https://echo.example.test/${op}`, {
				method: 'POST',
				body: JSON.stringify(args),
				headers: { authorization: `Bearer ${key}` }
			});
			const echoed = (await response.json()) as { text: string };
			return { ok: true, output: echoed.text, data: { authorised: key.length > 0 } };
		}
	}
};

/** The same line, leaking: the key inside a result string — what a recording must refuse. */
const leakyLine: ServiceLine = {
	...echoLine,
	id: 'acme/leaky',
	live: {
		...echoLine.live!,
		call: async (_op, _args, deps) => ({ ok: true, output: `key ${deps.getCredential('acme')}` })
	}
};

const acmePack: PackManifest = {
	id: 'acme',
	name: 'Acme',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	serviceLines: [echoLine]
};

/** A stand-in for the sandbox: answers with CORS open, echoing the body. */
const fakeFetch: typeof globalThis.fetch = async (input, init) => {
	const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { text?: string }) : {};
	return new Response(JSON.stringify({ text: `heard ${body.text ?? ''} at ${String(input)}` }), {
		headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
	});
};

describe('craftabot record', () => {
	it('records under the line’s own egress, times each call, reads the CORS checkpoint, and redacts the key', async () => {
		const root = await tmp();
		const scriptPath = join(root, 'calls.json');
		await writeFile(
			scriptPath,
			JSON.stringify([
				{ op: 'say', args: { text: 'hello' } },
				{ op: 'say', args: { text: 'again' } }
			])
		);
		const config = { ...defaultConfig(), packs: [...defaultConfig().packs, acmePack] };
		const credentials = credentialsFromEnv({ CRAFTABOT_CREDENTIAL_ACME: SECRET });
		const report = await recordCassette({
			lineId: 'acme/echo',
			scriptPath,
			out: join(root, 'cassettes'),
			config,
			credentials,
			fetch: fakeFetch,
			now: () => '2026-09-05T09:00:00.000Z'
		});
		expect(report.entries).toBe(2);
		expect(report.hosts).toEqual(['echo.example.test']);
		expect(report.browserCapable).toBe(true);
		expect(report.refused).toBe(0);
		expect(report.file.endsWith(cassetteFileName('acme/echo'))).toBe(true);

		const text = await readFile(report.file, 'utf8');
		expect(text).not.toContain(SECRET);
		const cassette = parseCassetteFile(JSON.parse(text));
		expect(cassette.lineId).toBe('acme/echo');
		expect(cassette.entries[0]?.result.output).toContain('heard hello');
		expect(cassette.entries[0]?.argsDigest).not.toBe(cassette.entries[1]?.argsDigest);
	});

	it('refuses to write a cassette when the line put the key inside a result — the exact-match scrub is not a net', async () => {
		const root = await tmp();
		const scriptPath = join(root, 'calls.json');
		await writeFile(scriptPath, JSON.stringify([{ op: 'say', args: {} }]));
		const config = {
			...defaultConfig(),
			packs: [...defaultConfig().packs, { ...acmePack, serviceLines: [leakyLine] }]
		};
		await expect(
			recordCassette({
				lineId: 'acme/leaky',
				scriptPath,
				out: join(root, 'cassettes'),
				config,
				credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_ACME: SECRET }),
				fetch: fakeFetch
			})
		).rejects.toThrow(/put a credential into a recorded result/);
		await expect(
			readFile(join(root, 'cassettes', cassetteFileName('acme/leaky')), 'utf8')
		).rejects.toThrow();
	});

	it('refuses a host the line did not declare, and records the refusal rather than the call', async () => {
		const root = await tmp();
		const scriptPath = join(root, 'calls.json');
		await writeFile(scriptPath, JSON.stringify([{ op: 'say', args: { text: 'x' } }]));
		const elsewhere: ServiceLine = {
			...echoLine,
			id: 'acme/stray',
			live: {
				...echoLine.live!,
				call: async (_op, _args, deps) => {
					await deps.fetch('https://not-declared.example.test/x');
					return { ok: true, output: 'never' };
				}
			}
		};
		const config = {
			...defaultConfig(),
			packs: [...defaultConfig().packs, { ...acmePack, serviceLines: [elsewhere] }]
		};
		const report = await recordCassette({
			lineId: 'acme/stray',
			scriptPath,
			out: join(root, 'cassettes'),
			config,
			credentials: credentialsFromEnv({ CRAFTABOT_CREDENTIAL_ACME: SECRET }),
			fetch: fakeFetch
		});
		expect(report.refused).toBe(1);
		const cassette = parseCassetteFile(JSON.parse(await readFile(report.file, 'utf8')));
		expect(cassette.entries[0]?.result).toMatchObject({
			ok: false,
			output: expect.stringContaining('not-declared')
		});
	});

	it('the CLI: a line with no live client, and --egress none, are refusals; the key never prints', async () => {
		const root = await tmp();
		let printed = '';
		const io = {
			env: { CRAFTABOT_CREDENTIAL_ACME: SECRET },
			stdout: (t: string) => void (printed += t),
			stderr: (t: string) => void (printed += t)
		};
		const scriptPath = join(root, 'calls.json');
		await writeFile(scriptPath, '[]');
		expect(
			await main(['record', '--line', 'starter/weather', '--script', scriptPath, '--out', root], io)
		).toBe(1);
		expect(printed).toContain('no live client');
		expect(printed).not.toContain(SECRET);
	});
});
