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
export {
	safetyCaseFor,
	safetyCaseFromSummaries,
	type EvaluationEvidence,
	type SafetyCase
} from './safety-case.js';
export {
	campaignEvidenceFor,
	type CampaignEvidence,
	type CampaignReportLike
} from './campaign-evidence.js';
export {
	DRIFT_DEFAULTS,
	dayOf,
	driftIn,
	mixDistance,
	telemetrySeries,
	type DriftFlag,
	type DriftReportLike,
	type TelemetryExtras,
	type DriftOptions,
	type TelemetryBucket
} from './drift.js';
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
export {
	decisionExplanation,
	explanationsForTicks,
	reasonsUsed,
	type DecisionExplanation,
	type DecisionExplanationOptions,
	type ReasonsUsed
} from './decision-explanation.js';
export {
	GENERIC_CONTROL_MAP_ID,
	GENERIC_CONTROL_MAP_MANIFEST,
	GOVERNANCE_GUARDRAIL_IDS,
	genericControlMap
} from './control-map.js';
export {
	boundaryMapFor,
	workflowRing,
	litEdgesAt,
	type BoundaryActivity,
	type BoundaryMap,
	type BoundaryOptions,
	type BoundaryOutside,
	type BoundaryOutsideKind,
	type BoundaryWorkflow,
	type BoundaryWorkflowStage
} from './boundary.js';
export {
	ASSURANCE_PACK_FORMAT,
	ASSURANCE_PACK_VERSION,
	ASSURANCE_POSTURE,
	assurancePackDigest,
	type AssuranceJourney,
	assurancePackFor,
	assurancePackFromStorage,
	canonicalJson,
	type AssuranceCampaign,
	type AssuranceCampaignReportLike,
	type AssuranceControlMap,
	type AssuranceControlRow,
	type AssuranceEvaluation,
	type AssuranceEvidence,
	type AssuranceOutcome,
	principalsOver,
	gatesOver,
	type AssuranceGate,
	type AssurancePack,
	type AssurancePackInput,
	type AssurancePrincipal,
	type EvidencePresence,
	type NotRecorded,
	type AssuranceControl
} from './assurance-pack.js';
export {
	controlEffectiveness,
	type ControlEffectivenessHeadline,
	type ControlEffectivenessRow
} from './control-effectiveness.js';
/** The Control Inventory (WP133, `110-CONTROL-SUITE-PLAN.md` §4): one row per control instance, eight facets. */
export {
	CONTROL_INVENTORY_FORMAT,
	INVENTORY_KIND_LABELS,
	INVENTORY_SURFACE_LABELS,
	campaignUses,
	controlFacetWords,
	controlInventory,
	controlInventoryExport,
	controlInventorySummary,
	evidenceRef,
	renderControlInventoryMarkdown,
	tripRef,
	type ControlInventoryExport,
	type InventoryFacet,
	type ControlInventoryInput,
	type ControlInventoryRow,
	type ControlInventorySummary,
	type InventoryCampaignReport,
	type InventoryEntryLink,
	type InventoryKind,
	type InventoryRowLink,
	type InventorySurface
} from './control-inventory.js';
/** The Sensor Inventory (WP159, `112-…` §5): every event type, its source, its readers. */
export {
	ENVELOPE_OPTIONAL,
	SENSOR_DECLARATIONS,
	SENSOR_READERS,
	payloadFields,
	renderSensorsMarkdown,
	sensorFindings,
	sensorInventory,
	sensorInventoryExport,
	type SensorDeclaration,
	type SensorField,
	type SensorInventoryExport,
	type SensorReach,
	type SensorReader,
	type SensorReaderDepth,
	type SensorReaderId,
	type SensorRow,
	type SensorSource
} from './sensors.js';
/** The coverage fold and the catalogue page (WP98, `86-…` §5, §7). */
export {
	coverageMeasurements,
	coverageReport,
	coverageSummary,
	renderCatalogueMarkdown,
	type CoverageMeasurement,
	type CoverageRow,
	type CoverageSummary
} from './coverage.js';
export {
	ASSURANCE_TOKENS,
	principalLine,
	renderAssurancePackHtml,
	renderAssurancePackMarkdown
} from './assurance-pack-render.js';
export { verdictFlow, verdictFlowSignature, type VerdictFlowRow } from './verdict-flow.js';
export {
	READING_KIND_LABELS,
	blueprintItems,
	readingProgress,
	readingQueue,
	knobChangesIn,
	readingSourcesFrom,
	readingSubjects,
	readingsExport,
	renderReadingsMarkdown,
	type BlueprintItem,
	type KnobChange,
	type ReadingBlueprintNote,
	type ReadingItem,
	type ReadingProgress,
	type ReadingScreeningList,
	type ReadingSourceLine,
	type ReadingSources,
	type ReadingState,
	type ReadingSubject,
	type ReadingsExport
} from './readings.js';
