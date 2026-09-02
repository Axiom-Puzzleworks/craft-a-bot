/**
 * **`@craftabot/telemetry`** (`35-TELEMETRY.md`, WP47; `26-…` §6.5): the
 * trace sink contract's implementation — the OTel mapping every sink and
 * host shares, the shared batching discipline, and the OTLP/HTTP sink.
 * The JSONL file sink is on `@craftabot/telemetry/node`. Depends on
 * `@craftabot/core` and nothing else in the repo.
 */
export {
	describeSinkProblems,
	type CreateSinkOptions,
	type SinkError,
	type SinkInstance,
	type SinkResult,
	type SinkStatus,
	type TraceExport,
	type TraceSink
} from './types.js';
export {
	otelTraceFor,
	otelTraceForExport,
	otelTraceForGroup,
	type OtelAttribute,
	type OtelSpan,
	type OtelSpanEvent,
	type OtelTrace
} from './otel.js';
export { createBatcher, type Batcher, type BatchingOptions } from './batch.js';
export {
	OTLP_HTTP_CREDENTIAL_ID,
	OTLP_HTTP_SINK_ID,
	otlpHttpConfigSchema,
	otlpHttpSink,
	tracesEndpoint,
	type OtlpHttpConfig
} from './otlp-http.js';

import { otlpHttpSink } from './otlp-http.js';
import type { TraceSink } from './types.js';

/** The sinks the browser can use; the file sink joins on the `/node` entry. */
export const browserSinks: TraceSink[] = [otlpHttpSink];
