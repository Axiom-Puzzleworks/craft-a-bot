/**
 * `@craftabot/governance/reports` — the governance *artefacts* derived from a
 * trace (WP36 stage B, `26-TARGET-DESIGN-V3.md` §6.14): what went wrong, the
 * incident log (`19-…` #31), the safety-case worksheet (`19-…` #28), cross-run
 * telemetry (`19-…` #36) and the safety tally. Pure folds over stored runs and
 * their events — no DOM, no store, no UI — so a headless host produces the
 * same JSON the Workshop's screens render.
 *
 * Since WP36 stage C every report is computed over a run's `RunSummary` — the
 * per-run fold `summariseRun` makes once when a run finishes — and the
 * event-taking signatures are wrappers that summarise first. One path, so the
 * two cannot disagree.
 *
 * A subpath rather than the main barrel, deliberately: `08-…` §5's export row
 * names the *mechanisms* (rules, the policy compiler) as what ships to a real
 * agent stack, and the main barrel stays that. Reports are the second thing
 * worth exporting, kept beside it without being mixed into it — the same
 * shape `@craftabot/core/testing` takes for the same reason.
 */
export { isFailure } from './failures.js';
export { summariesOf, summariseRun } from './summary.js';
export { ensureRunSummaries, persistRunSummary } from './run-summaries.js';
export {
	findingsIn,
	incidentsFrom,
	incidentsFromSummaries,
	type Incident,
	type IncidentFinding,
	type IncidentKind
} from './incidents.js';
export { safetyCaseFor, safetyCaseFromSummaries, type SafetyCase } from './safety-case.js';
export {
	autonomyTelemetry,
	autonomyTelemetryFromSummaries,
	guardrailMix,
	guardrailMixFromSummaries,
	telemetryByCard,
	telemetryByCartridge,
	type AutonomyTelemetry,
	type CartridgeTelemetry,
	type GoalCardTelemetry,
	type GuardrailMixEntry
} from './telemetry.js';
export { safetyTally, type SafetyTally } from './safety-tally.js';
