/**
 * `@craftabot/pack-testkit` — the pack-conformance kit (`13-…` §7, WP21).
 *
 * Two halves: a plain assertion library (`check*`, below) that any pack's own
 * test file can call directly, and a Vitest adapter (`describeConformance`)
 * that wraps those checks in `it()` blocks for the common case. Neither
 * throws on a failing pack — every `check*` function returns a
 * `ConformanceIssue[]`, empty when the pack passes.
 */
export { checkCartridge } from './checks/cartridge.js';
export { checkGoldenTrace } from './checks/golden-trace.js';
export { checkEvaluator } from './checks/evaluator.js';
export { checkSink } from './checks/sink.js';
export { describeSinkConformance } from './describe-sink.js';
export { checkGuardrail } from './checks/guardrail.js';
export { checkGuardrailService, hostMatches } from './checks/guardrail-service.js';
export { checkManifest } from './checks/manifest.js';
export { checkTool } from './checks/tool.js';
export { checkWorld } from './checks/world.js';
export { checkDesk } from './checks/desk.js';
export {
	checkSynthetic,
	ibanValid,
	luhnValid,
	reservedDomain,
	type SyntheticSweepFile
} from './checks/synthetic.js';
export { describeConformance } from './describe-conformance.js';
export type {
	ConformanceIssue,
	DeskConformanceFixture,
	GoldenTraceConformanceFixture,
	GuardrailConformanceEntry,
	GuardrailConformanceFixture,
	EvaluatorConformanceFixture,
	SinkConformanceFixture,
	GuardrailServiceConformanceFixture,
	PackConformanceFixture,
	ToolConformanceFixture,
	WorldConformanceFixture,
	WorldIllegalCallFixture,
	WorldScriptFixture
} from './types.js';
