import {
	createEgressGuard,
	type EgressMode,
	type SinkInstance,
	type TraceSink
} from '@craftabot/core';
import { otlpHttpSink } from '@craftabot/telemetry';
import { fileSink } from '@craftabot/telemetry/node';
import type { CredentialSource } from './credentials.js';

/**
 * **The harness's sinks** (`35-TELEMETRY.md` §4.5, WP47): the two the
 * telemetry package ships, by id, built behind the same egress guard a
 * run's components get — `declared` allows the sink's own host, `none`
 * refuses it and the sink reports the refusal rather than the run.
 */

export const harnessSinks: TraceSink[] = [otlpHttpSink, fileSink];

export function sinkById(id: string): TraceSink {
	const sink = harnessSinks.find((candidate) => candidate.id === id);
	if (!sink) {
		throw new Error(`unknown sink "${id}" — one of ${harnessSinks.map((s) => s.id).join(', ')}`);
	}
	return sink;
}

export function parseSinkConfig(sink: TraceSink, json: string | undefined): unknown {
	let raw: unknown = {};
	if (json !== undefined) {
		try {
			raw = JSON.parse(json);
		} catch {
			throw new Error(`--sink-config for ${sink.id} is not JSON`);
		}
	}
	const parsed = sink.configSchema.safeParse(raw);
	if (!parsed.success) {
		throw new Error(`${sink.id} config: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
	}
	return parsed.data;
}

export function buildSink(options: {
	sink: TraceSink;
	config: unknown;
	credentials: CredentialSource;
	fetch?: typeof globalThis.fetch;
	egress?: EgressMode;
	onError?: (message: string) => void;
}): SinkInstance {
	const guard = createEgressGuard({
		mode: options.egress ?? 'declared',
		fetch: options.fetch ?? globalThis.fetch.bind(globalThis)
	});
	guard.allow(options.sink.egress(options.config));
	return options.sink.create({
		config: options.config,
		fetch: guard.fetch,
		getCredential: (id) => options.credentials.get(id),
		...(options.onError ? { onError: (error) => options.onError?.(error.message) } : {})
	});
}
