import type { SinkResult, Storage } from '@craftabot/core';
import type { CredentialSource } from '../credentials.js';
import { buildSink, parseSinkConfig, sinkById } from '../sinks.js';

/**
 * **`craftabot export`** (`35-TELEMETRY.md` §4.5, WP47): a stored run, sent
 * to a sink in one go — the Audit Centre's "Send to…" without a browser.
 */

export interface ExportRunOptions {
	storage: Storage;
	runId: string;
	sinkId: string;
	sinkConfig?: string;
	credentials: CredentialSource;
	fetch?: typeof globalThis.fetch;
}

export async function exportRun(options: ExportRunOptions): Promise<SinkResult> {
	const run = await options.storage.getRun(options.runId);
	if (!run) throw new Error(`no stored run "${options.runId}"`);
	const events = (await options.storage.getEvents(options.runId)).map((row) => row.event);
	const evaluations = await options.storage.listEvaluations(options.runId);
	const sink = sinkById(options.sinkId);
	const config = parseSinkConfig(sink, options.sinkConfig);
	const instance = buildSink({
		sink,
		config,
		credentials: options.credentials,
		...(options.fetch ? { fetch: options.fetch } : {})
	});
	return instance.export({ run, events, evaluations });
}
