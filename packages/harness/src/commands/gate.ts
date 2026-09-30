import type { EventBus, Principal } from '@craftabot/core';
import { createEventBus } from '@craftabot/core';
import {
	GATE_CONTENT,
	GATE_SPEC,
	createGate,
	parseStackFile,
	serveGate,
	type Gate,
	type GateMode
} from '@craftabot/gate';
import { readFile } from 'node:fs/promises';
import { createRegistry, type HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { buildSink, parseSinkConfig, sinkById } from '../sinks.js';

/**
 * **`craftabot gate`** (WP127, `107-THE-GATE.md`): `serve` a stack over the
 * chat-completions wire in front of one upstream, and `approve`/`deny` what it
 * paused. The stack is a registered stack's id (the five presets, a desk's)
 * or a file — a stack, or one the Studio saved. The upstream key is read from
 * `CRAFTABOT_GATE_UPSTREAM_KEY` at each call and nowhere else; every
 * conversation's events go to `--sink` when one is named.
 */
export const GATE_KEY_VARIABLE = 'CRAFTABOT_GATE_UPSTREAM_KEY';
export const DEFAULT_GATE_PORT = 8127;

export interface GateServeOptions {
	stack: string;
	upstream: string;
	mode: GateMode;
	config: HarnessConfig;
	env: NodeJS.ProcessEnv;
	credentials: CredentialSource;
	host?: string;
	port?: number;
	allowRemote?: boolean;
	principal?: Principal;
	sink?: { id: string; config?: string };
	fetch?: typeof globalThis.fetch;
}

export async function gateServe(
	options: GateServeOptions
): Promise<{ gate: Gate; url: string; line: string; close(): Promise<void> }> {
	const registry = createRegistry(options.config);
	registry.registerPack(GATE_CONTENT);
	const stack =
		registry.getStack(options.stack) ??
		parseStackFile(JSON.parse(await readFile(options.stack, 'utf8')) as unknown);
	const events: EventBus = createEventBus();
	const sinkDefinition = options.sink ? sinkById(options.sink.id) : undefined;
	const sink =
		sinkDefinition && options.sink
			? buildSink({
					sink: sinkDefinition,
					config: parseSinkConfig(sinkDefinition, options.sink.config),
					credentials: options.credentials
				})
			: undefined;
	const detach = sink?.attach(events, { agentId: GATE_SPEC.id });
	const gate = createGate({
		stack,
		registry,
		upstream: { baseUrl: options.upstream },
		mode: options.mode,
		// Read at the call, from the environment, never kept (hard rule 2).
		upstreamKey: () => options.env[GATE_KEY_VARIABLE],
		events,
		...(options.principal ? { principal: options.principal } : {}),
		...(options.fetch ? { fetch: options.fetch } : {})
	});
	const served = await serveGate(gate, {
		host: options.host ?? '127.0.0.1',
		port: options.port ?? DEFAULT_GATE_PORT,
		...(options.allowRemote ? { allowRemote: true } : {})
	});
	const line = `the Gate on ${served.url} — ${options.mode}, stack ${stack.id}, upstream ${new URL(options.upstream).host}; unauthenticated, a reference implementation (107-THE-GATE.md)${options.env[GATE_KEY_VARIABLE] ? '' : `; no ${GATE_KEY_VARIABLE}, so the upstream is called without a key`}`;
	return {
		gate,
		url: served.url,
		line,
		close: async () => {
			detach?.();
			await sink?.flush();
			await served.close();
		}
	};
}

/** `craftabot gate approve|deny <id>`: the operator's answer, to a Gate listening on loopback. */
export async function gateAnswer(
	approvalId: string,
	approved: boolean,
	gateUrl = `http://127.0.0.1:${DEFAULT_GATE_PORT}`,
	fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<string> {
	const response = await fetchImpl(
		`${gateUrl.replace(/\/+$/, '')}/v1/gate/approvals/${encodeURIComponent(approvalId)}`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ approved })
		}
	);
	const body = (await response.json()) as { status?: string; error?: { message?: string } };
	if (!response.ok) throw new Error(body.error?.message ?? `the Gate answered ${response.status}`);
	return `approval ${approvalId}: ${body.status ?? (approved ? 'approved' : 'denied')}`;
}
