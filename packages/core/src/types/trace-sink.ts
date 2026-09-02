import type { z } from 'zod';
import type { EngineEvent } from '../schemas/events.js';
import type { EvaluationRecord } from '../schemas/evaluation.js';
import type { GroupRunRecord } from '../schemas/records.js';
import type { RunRecord } from '../schemas/trace-file.js';
import type { EventBus, Unsubscribe } from '../event-bus.js';
import type { EgressDeclaration } from './guardrail-service.js';
import type { BrickKindDefinition } from './brick.js';

/**
 * **The trace sink contract** (`35-TELEMETRY.md` §4.1, WP47; `26-…` §6.5).
 * A sink is a consumer: it subscribes to a live bus or is handed a finished
 * trace, batches and sends on its own schedule, and surfaces its own
 * failures on itself — never on the run. The contract lives here beside
 * `GuardrailService` and `Evaluator` so the testkit and a host can name it
 * without depending on `@craftabot/telemetry`, which implements it.
 */

/** What a stored run gives (the `craftabot-bundle` of WP48 is built from the same fields). */
export interface TraceExport {
	run: RunRecord;
	events: readonly EngineEvent[];
	/** A group episode: its record, the merged stream, and every member's own trace. */
	group?: {
		record: GroupRunRecord;
		events: readonly EngineEvent[];
		members: ReadonlyArray<{ run: RunRecord; events: readonly EngineEvent[] }>;
	};
	evaluations?: readonly EvaluationRecord[];
}

export interface SinkError {
	sinkId: string;
	message: string;
	/** What was being done: a live flush or a whole-trace export. */
	during: 'flush' | 'export';
}

export type SinkResult = { ok: true; sent: number } | { ok: false; error: string };

export interface SinkStatus {
	attached: boolean;
	/** Events buffered and not yet sent. */
	buffered: number;
	/** Spans (or lines) sent so far. */
	sent: number;
	/** Flushes and exports that failed. */
	failed: number;
	lastError?: string;
}

export interface SinkInstance {
	/** Live: subscribe to a bus; the sink batches and flushes on its own schedule. Never throws. */
	attach(events: EventBus, run: { runId: string; agentId: string }): Unsubscribe;
	/** Stored: export a finished run (or a group episode) in one go. Never rejects: a failure is `{ ok: false }`. */
	export(input: TraceExport): Promise<SinkResult>;
	/** Send whatever is buffered now. Never rejects. */
	flush(): Promise<void>;
	status(): SinkStatus;
}

export interface CreateSinkOptions {
	config: unknown;
	fetch: typeof globalThis.fetch;
	getCredential(id: string): string | undefined;
	/** Told of every failure, beside `status()`; a host shows it, the run never hears. */
	onError?: (error: SinkError) => void;
	now?: () => number;
}

export interface TraceSink {
	/** `telemetry/file`, `telemetry/otlp-http`, `vendor/langfuse` … */
	id: string;
	name: string;
	description: string;
	credential?: BrickKindDefinition['credential'];
	/** Where this sink will call, for the configuration given — a function, since the host is what the person typed. */
	egress(config: unknown): EgressDeclaration[];
	configSchema: z.ZodType<unknown>;
	create(options: CreateSinkOptions): SinkInstance;
}

/** Why a sink is not fit to use — the same shape the registry gives a guard service. */
export function describeSinkProblems(sink: TraceSink): string[] {
	const problems: string[] = [];
	if (typeof sink.id !== 'string' || sink.id.trim() === '') problems.push('has no id');
	if (typeof sink.name !== 'string' || sink.name.trim() === '') problems.push('has no name');
	if (typeof sink.egress !== 'function') problems.push('declares no egress');
	if (typeof sink.create !== 'function') problems.push('cannot be created');
	if (sink.configSchema === undefined) problems.push('has no config schema');
	return problems;
}
