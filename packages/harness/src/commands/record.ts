import {
	CASSETTE_FORMAT_VERSION,
	argsDigest,
	containsSecret,
	createEgressGuard,
	redactSecrets,
	type CassetteEntry,
	type CassetteFile,
	type EgressMode,
	type ServiceLine
} from '@craftabot/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRegistry, type HarnessConfig } from '../config.js';
import { credentialVariable, type CredentialSource } from '../credentials.js';

/**
 * **`craftabot record`** (WP58 stage B, `47-SERVICE-LINES.md` §4.2): the
 * one path that runs a service line's `live`. Under an egress guard that
 * allows the line's own declared hosts and nothing else, every call in the
 * script is made, timed, and written to a cassette **redacted against every
 * secret the process holds** — a fixture a pack ships under `src/cassettes/`
 * and a session replays without a network. `--egress none` refuses every
 * call and writes nothing, so a CI job cannot record by accident.
 */
export interface RecordOptions {
	lineId: string;
	/** `Array<{ op, args }>`, as JSON. */
	scriptPath: string;
	out: string;
	config: HarnessConfig;
	credentials: CredentialSource;
	egress?: EgressMode;
	fetch?: typeof globalThis.fetch;
	now?: () => string;
	/** Per call, in milliseconds; default 15 000. */
	timeoutMs?: number;
}

export interface RecordReport {
	lineId: string;
	file: string;
	entries: number;
	/** Hosts the guard allowed — the line's declarations. */
	hosts: string[];
	/** Whether the first response carried `access-control-allow-origin: *` — the browser checkpoint (`47-…` §4.4). */
	browserCapable: boolean | undefined;
	latencyMs: { min: number; max: number };
	refused: number;
}

interface RecordCall {
	op: string;
	args?: unknown;
}

/** `starter/open-meteo` → `starter-open-meteo.craftabot-cassette.json`. */
export function cassetteFileName(lineId: string): string {
	return `${lineId.replaceAll('/', '-')}.craftabot-cassette.json`;
}

export async function recordCassette(options: RecordOptions): Promise<RecordReport> {
	const registry = createRegistry(options.config);
	const line: ServiceLine | undefined = registry.getServiceLine(options.lineId);
	if (!line) {
		throw new Error(
			`no service line '${options.lineId}' is installed — try one of: ${registry
				.listServiceLines()
				.map((candidate) => candidate.id)
				.join(', ')}`
		);
	}
	if (!line.live) throw new Error(`the line '${line.id}' has no live client to record from`);
	if (line.live.credential) {
		const key = options.credentials.get(line.live.credential.id);
		if (key === undefined) {
			throw new Error(
				`the line '${line.id}' needs ${credentialVariable(line.live.credential.id)} in the environment`
			);
		}
	}

	const script = JSON.parse(await readFile(options.scriptPath, 'utf8')) as unknown;
	if (!Array.isArray(script) || script.some((call) => typeof call?.op !== 'string')) {
		throw new Error(`${options.scriptPath} must be a JSON array of { "op": string, "args"?: … }`);
	}
	const calls = script as RecordCall[];

	let refused = 0;
	const guard = createEgressGuard({
		mode: options.egress ?? 'declared',
		fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
		onRefused: () => {
			refused += 1;
		}
	});
	guard.allow(line.live.egress);

	let browserCapable: boolean | undefined;
	// The browser checkpoint: a server only answers CORS to a request that
	// carries an Origin, so the probe sends one the way a page would.
	const seeingFetch: typeof globalThis.fetch = async (input, init) => {
		const headers = new Headers(init?.headers);
		if (!headers.has('origin')) headers.set('origin', 'https://craftabot.example');
		const response = await guard.fetch(input, { ...init, headers });
		if (browserCapable === undefined) {
			const origin = response.headers.get('access-control-allow-origin');
			browserCapable = origin === '*';
		}
		return response;
	};

	const entries: CassetteEntry[] = [];
	const latencies: number[] = [];
	for (const call of calls) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
		const started = performance.now();
		let result;
		try {
			result = await line.live.call(call.op, call.args ?? {}, {
				fetch: seeingFetch,
				getCredential: (id) => options.credentials.get(id),
				signal: controller.signal
			});
		} catch (error) {
			result = {
				ok: false,
				output: `The recording call failed: ${error instanceof Error ? error.message : String(error)}`
			};
		} finally {
			clearTimeout(timer);
		}
		const latencyMs = Math.max(0, Math.round(performance.now() - started));
		latencies.push(latencyMs);
		entries.push({
			op: call.op,
			argsDigest: await argsDigest(call.args ?? {}),
			args: call.args ?? {},
			result,
			latencyMs
		});
	}

	const cassette: CassetteFile = redactSecrets(
		{
			format: 'craftabot-cassette',
			formatVersion: CASSETTE_FORMAT_VERSION,
			lineId: line.id,
			recordedAt: (options.now ?? (() => new Date().toISOString()))(),
			recordedBy: 'craftabot-harness/0.0.1',
			egress: line.live.egress,
			entries
		},
		options.credentials.secrets()
	);
	// `redactSecrets` is an exact-match scrub by design (`redact.ts`): a key that
	// a line embedded *inside* a result string survives it, and that is a line
	// that leaks, not a cassette to keep. Refuse, loudly, and write nothing.
	if (containsSecret(cassette, options.credentials.secrets())) {
		throw new Error(
			`the line '${line.id}' put a credential into a recorded result — nothing was written; fix the line so its results never carry the key`
		);
	}
	await mkdir(options.out, { recursive: true });
	const file = join(options.out, cassetteFileName(line.id));
	await writeFile(file, `${JSON.stringify(cassette, null, '\t')}\n`, 'utf8');

	return {
		lineId: line.id,
		file,
		entries: entries.length,
		hosts: guard.hosts(),
		browserCapable,
		latencyMs: {
			min: latencies.length === 0 ? 0 : Math.min(...latencies),
			max: latencies.length === 0 ? 0 : Math.max(...latencies)
		},
		refused
	};
}
