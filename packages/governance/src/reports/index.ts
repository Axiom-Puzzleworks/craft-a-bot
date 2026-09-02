/**
 * `@craftabot/governance/reports` — the governance *artefacts* derived from a
 * trace (WP36 stage B, `26-TARGET-DESIGN-V3.md` §6.14): what went wrong, the
 * incident log (`19-…` #31), the safety-case worksheet (`19-…` #28), cross-run
 * telemetry (`19-…` #36) and the safety tally. Pure folds over stored runs and
 * their events — no DOM, no store, no UI — so a headless host produces the
 * same JSON the Workshop's screens render.
 *
 * A subpath rather than the main barrel, deliberately: `08-…` §5's export row
 * names the *mechanisms* (rules, the policy compiler) as what ships to a real
 * agent stack, and the main barrel stays that. Reports are the second thing
 * worth exporting, kept beside it without being mixed into it — the same
 * shape `@craftabot/core/testing` takes for the same reason.
 */
export { isFailure } from './failures.js';
export {
	incidentsFrom,
	type Incident,
	type IncidentFinding,
	type IncidentKind
} from './incidents.js';
export { safetyCaseFor, type SafetyCase } from './safety-case.js';
export {
	autonomyTelemetry,
	guardrailMix,
	telemetryByCard,
	telemetryByCartridge,
	type AutonomyTelemetry,
	type CartridgeTelemetry,
	type GoalCardTelemetry,
	type GuardrailMixEntry
} from './telemetry.js';
export { safetyTally, type SafetyTally } from './safety-tally.js';
