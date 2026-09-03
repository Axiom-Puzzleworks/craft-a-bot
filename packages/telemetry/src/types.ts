/**
 * The contract itself lives in `@craftabot/core` (`35-TELEMETRY.md` §7
 * D-f) beside `GuardrailService` and `Evaluator`; this package implements
 * it and re-exports the names so a sink author imports one package.
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
} from '@craftabot/core';
