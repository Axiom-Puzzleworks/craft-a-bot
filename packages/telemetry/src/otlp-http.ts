import { hostOf, type EgressDeclaration, type EngineEvent, type TraceSink } from '@craftabot/core';
import { z } from 'zod';
import { createBatcher } from './batch.js';
import { otelTraceFor, otelTraceForExport, type OtelTrace } from './otel.js';

/**
 * **`telemetry/otlp-http`** (`35-…` §4.3, WP47): OTLP/HTTP JSON to a
 * collector the person names — `POST {url}/v1/traces`. Live, each flush
 * sends the spans the buffered events map to, all on the run's own trace
 * id, so a collector stitches the batches into one trace. An optional
 * bearer token rides as `Authorization`; the declared egress is the url's
 * host, so the guard the host builds allows exactly that.
 */

export const OTLP_HTTP_SINK_ID = 'telemetry/otlp-http';
export const OTLP_HTTP_CREDENTIAL_ID = 'telemetry/otlp-http';

export const otlpHttpConfigSchema = z.object({
	url: z.string().url(),
	headers: z.record(z.string(), z.string()).default({}),
	batchSize: z.number().int().min(1).max(5000).default(200),
	flushAfterMs: z.number().int().min(50).max(60000).default(1000)
});
export type OtlpHttpConfig = z.infer<typeof otlpHttpConfigSchema>;

export function tracesEndpoint(url: string): string {
	return `${url.replace(/\/+$/, '')}/v1/traces`;
}

function spanCount(trace: OtelTrace): number {
	return trace.resourceSpans[0].scopeSpans[0].spans.length;
}

/** A partial trace for a live batch: the run as known so far, only these events' spans. */
function liveTrace(
	events: readonly EngineEvent[],
	run: { runId: string; agentId: string }
): OtelTrace | undefined {
	const started = events.find((event) => event.type === 'run.started');
	const finished = events.find((event) => event.type === 'run.finished');
	// The mapping needs a run record; a live batch has only what the stream said.
	const stub = {
		id: run.runId,
		agentId: run.agentId,
		// A live batch knows the run by id; the stored export carries the names.
		agentName: run.agentId,
		goalCardId: '',
		providerId: started?.type === 'run.started' ? started.payload.providerId : '',
		wireModel: started?.type === 'run.started' ? started.payload.wireModel : '',
		outcome: finished?.type === 'run.finished' ? finished.payload.outcome : 'IN_PROGRESS',
		ticks: events.at(-1)?.tick ?? 0,
		usage: { inputTokens: 0, outputTokens: 0 },
		startedAt: events[0]?.timestamp ?? new Date(0).toISOString(),
		...(finished ? { finishedAt: finished.timestamp } : {})
	};
	const trace = otelTraceFor(stub as never, events);
	// A batch with nothing the mapping recognises still carries the root span; send only when something happened.
	return spanCount(trace) > 1 || finished !== undefined ? trace : undefined;
}

export const otlpHttpSink: TraceSink = {
	id: OTLP_HTTP_SINK_ID,
	name: 'OTLP collector (HTTP)',
	description:
		'Sends each run as an OpenTelemetry trace — one invoke_agent span with chat, tool and guardrail spans beneath it — to a collector over OTLP/HTTP JSON.',
	credential: {
		id: OTLP_HTTP_CREDENTIAL_ID,
		name: 'Collector token',
		kind: 'bearer-token',
		keysUrl: 'https://opentelemetry.io/docs/collector/'
	},
	egress: (config): EgressDeclaration[] => {
		const parsed = otlpHttpConfigSchema.safeParse(config);
		if (!parsed.success) return [];
		return [{ host: hostOf(parsed.data.url), purpose: 'trace export', sends: ['trace'] }];
	},
	configSchema: otlpHttpConfigSchema,
	create: ({ config, fetch, getCredential, onError, now }) => {
		const parsed = otlpHttpConfigSchema.parse(config);
		const endpoint = tracesEndpoint(parsed.url);
		async function post(trace: OtelTrace): Promise<number> {
			const token = getCredential(OTLP_HTTP_CREDENTIAL_ID);
			let response: Response;
			try {
				response = await fetch(endpoint, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						...parsed.headers,
						...(token ? { authorization: `Bearer ${token}` } : {})
					},
					body: JSON.stringify(trace)
				});
			} catch (cause) {
				// The transport's own words stay here: a fetch error can quote the request, and the request carries the token.
				const aborted = cause instanceof Error && cause.name === 'AbortError';
				throw new Error(
					aborted ? 'the collector took too long to answer' : 'the collector could not be reached',
					{ cause }
				);
			}
			if (!response.ok) throw new Error(`collector answered ${response.status}`);
			return spanCount(trace);
		}
		return createBatcher({
			sinkId: OTLP_HTTP_SINK_ID,
			batchSize: parsed.batchSize,
			flushAfterMs: parsed.flushAfterMs,
			send: async (events, run) => {
				const trace = liveTrace(events, run);
				return trace ? post(trace) : 0;
			},
			sendExport: (input) => post(otelTraceForExport(input)),
			onError,
			now
		});
	}
};
