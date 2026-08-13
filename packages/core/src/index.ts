/**
 * @craftabot/core — headless agent engine.
 * Public API. See docs/design/02-AGENT-MODEL.md, 07-DATA-MODEL-PERSISTENCE.md.
 */

// Types (hand-written interfaces — 02-AGENT-MODEL.md §6, 06 §2, 08 §2, 02 §4)
export type {
	AgentSession,
	CreateSession,
	CreateSessionDeps,
	SessionOptions,
	RunMode,
	RunOutcome,
	SessionStatus,
	TickResult
} from './types/agent-session.js';
export type {
	ChatMessage,
	ChatRequest,
	ChatResponse,
	ChatRole,
	KeyCheck,
	LLMProvider,
	ProviderError,
	ProviderErrorKind,
	ToolSchema
} from './types/provider.js';
export type {
	Guardrail,
	GuardrailContext,
	GuardrailHook,
	GuardrailVerdict
} from './types/guardrail.js';
export type {
	ActionCall,
	ActionResult,
	Observation,
	WorldActionDefinition,
	WorldDefinition,
	WorldInstance,
	WorldLayout,
	WorldSenseDefinition,
	WorldState
} from './types/world.js';
export type { JsonSchema } from './types/json-schema.js';
export type {
	ActionId,
	BrickId,
	CartridgeId,
	ConceptTag,
	GoalCardId,
	GuardrailId,
	SenseChannelId,
	ToolId,
	WorldId,
	WorldPredicateId
} from './types/ids.js';
export {
	brickSlotSchema,
	buildProblemCodeSchema,
	buildProblemSchema,
	buildProblemSeveritySchema,
	type BrickSlot,
	type BuildProblem,
	type BuildProblemCode,
	type BuildProblemSeverity
} from './schemas/build-problem.js';

// Schemas (Zod-first types — 07-DATA-MODEL-PERSISTENCE.md §6)
export {
	agentIdentitySchema,
	agentSpecV2Schema,
	asLegacySpec,
	brickInSlot,
	fittedBrickSchema,
	legacyBricks,
	toSpecV2,
	type AnyAgentSpec,
	migrateAgentSpec,
	parseAgentSpecV2,
	safeParseAgentSpecV2,
	type AgentIdentity,
	type AgentSpecV2,
	type FittedBrick,
	type SpecMigrationError
} from './schemas/agent-spec-v2.js';
export {
	actionsBrickSchema,
	agentSpecSchema,
	llmBrickSchema,
	memoryBrickSchema,
	parseAgentSpec,
	safeParseAgentSpec,
	safetyBrickSchema,
	senseBrickSchema,
	toolsBrickSchema,
	type AgentSpec
} from './schemas/agent-spec.js';
export {
	brickDefinitionSchema,
	cartridgeDefinitionSchema,
	goalCardDefinitionSchema,
	packManifestMetadataSchema,
	toolMetadataSchema,
	type BrickDefinition,
	type CartridgeDefinition,
	type GoalCardDefinition,
	type GuardrailDefinition,
	type PackArtwork,
	type PackManifest,
	type PackManifestMetadata,
	type ToolMetadata
} from './schemas/pack-manifest.js';
export type { NotebookAccess, ToolContext, ToolDefinition, ToolResult } from './types/tool.js';
export {
	engineEventSchema,
	parseEngineEvent,
	safeParseEngineEvent,
	type EngineEvent,
	type EventType
} from './schemas/events.js';
/**
 * The shapes that cross every boundary, defined once (E5, `14-…` §3). The
 * schemas are exported alongside the types so a pack can validate what it
 * produces against the same definition the engine infers from.
 */
export {
	actionResultSchema,
	chatMessageSchema,
	chatResponseSchema,
	guardrailHookSchema,
	guardrailVerdictSchema,
	observationSchema,
	proposedStepSchema,
	runOutcomeSchema,
	usageSchema,
	type ProposedStep,
	type TokenUsage
} from './schemas/shared.js';
export {
	kitFileSchema,
	migrateKitFile,
	parseKitFile,
	safeParseKitFile,
	type KitFile,
	type MigrationError
} from './schemas/kit-file.js';
export {
	agentRecordSchema,
	migrateAgentRecord,
	parseAgentRecord,
	safeParseAgentRecord,
	safeParseStoredEvent,
	storedEventSchema,
	type AgentRecord,
	type StoredEvent
} from './schemas/records.js';

// Persistence helpers (07-DATA-MODEL-PERSISTENCE.md §4–5)
export {
	brickKindsFor,
	buildKitFile,
	importKitFile,
	type BuildKitFileOptions,
	type ImportKitFileOptions,
	type ImportProblem,
	type ImportedKit
} from './persistence/kit-export.js';
export {
	buildTraceFile,
	verifyTraceDigest,
	type BuildTraceFileOptions
} from './persistence/trace-export.js';
export { REDACTED, containsSecret, redactSecrets } from './persistence/redact.js';

export {
	TRACE_FORMAT_VERSION,
	computeTraceDigest,
	migrateTraceFile,
	parseTraceFile,
	runRecordSchema,
	safeParseTraceFile,
	traceFileSchema,
	type RunRecord,
	type TraceFile,
	type TraceMigrationError
} from './schemas/trace-file.js';

// Utilities
export {
	createEventBus,
	type AnyEventListener,
	type EventBus,
	type EventListener,
	type Unsubscribe
} from './event-bus.js';
export { createPackRegistry, type PackRegistry } from './pack-registry.js';
/** The open brick contract (`14-…` §2, WP14). */
export {
	SLOT_IDS,
	type BrickConfigMigration,
	type BrickConfigMigrationTable,
	type BrickKindDefinition,
	type BrickRuntime,
	type BrickRuntimeContext,
	type ContextContribution,
	type SlotId,
	type TickContext,
	type TickRecord
} from './types/brick.js';
export { validateSpec } from './validate-spec.js';
export { validateSpecV2 } from './validate-spec-v2.js';

// The running engine (02-AGENT-MODEL.md §5)
export { createSession } from './session/agent-session.js';
export {
	DEFAULT_REQUEST_TIMEOUT_MS,
	DEFAULT_TICK_BUDGET,
	DEFAULT_TOKEN_BUDGET,
	displayedTickBudget,
	resolveBudgets,
	type BudgetLimits,
	type Usage
} from './session/budgets.js';
export {
	REPROMPT_INSTRUCTION,
	decide,
	type Decision,
	type DecisionCall
} from './session/decide.js';
export {
	buildRuntimes,
	collectContext,
	disposeRuntimes,
	notifyTickEnd,
	type BuildRuntimesOptions,
	type FittedRuntime
} from './session/brick-runtimes.js';
export { createMemory, summariseWindow, type Memory, type TickMemory } from './session/memory.js';
export {
	composePrompt,
	composeSystemMessage,
	describeFittedBricks,
	estimateTokens
} from './session/prompt.js';
export {
	isAllowed,
	isPause,
	runGuardrailChain,
	type ChainOutcome
} from './session/guardrail-chain.js';
