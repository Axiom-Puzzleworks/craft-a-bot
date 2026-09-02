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
	ProviderFactory,
	ToolSchema
} from './types/provider.js';
export type {
	ExternalCallRecord,
	Guardrail,
	GuardrailContext,
	GuardrailHook,
	GuardrailVerdict
} from './types/guardrail.js';
export type {
	ActionCall,
	ActionResult,
	AgentHandle,
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
	brickInSlot,
	fittedBrickSchema,
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
	safetyBrickSchemaV2,
	senseBrickSchema,
	toolsBrickSchema,
	type AgentSpec,
	type SafetyBrickConfigV2
} from './schemas/agent-spec.js';
export { migrateBrickConfig } from './brick-config.js';
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
export type {
	GridPosition,
	GridWorldAgent,
	GridWorldCharacter,
	GridWorldContainer,
	GridWorldContainerState,
	GridWorldFurniture,
	GridWorldItem,
	GridWorldItemLocation,
	GridWorldState
} from './types/grid-world.js';
export { riskTierSchema, type RiskTier } from './schemas/risk-tier.js';
export {
	ASSERTION_CARD_SCHEMA_VERSION,
	assertionCardSchema,
	assertionQuantifierSchema,
	parseAssertionCard,
	safeParseAssertionCard,
	type AssertionCard,
	type AssertionQuantifier
} from './schemas/assertion-card.js';
export {
	POLICY_CARD_SCHEMA_VERSION,
	parsePolicyCard,
	policyCardSchema,
	policyDispositionSchema,
	policyRuleSchema,
	predicateExprSchema,
	safeParsePolicyCard,
	type PolicyCard,
	type PolicyDisposition,
	type PolicyRule,
	type PredicateExpr
} from './schemas/policy-card.js';
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
	assistantToolCallSchema,
	chatMessageSchema,
	chatResponseSchema,
	guardrailHookSchema,
	guardrailVerdictSchema,
	observationSchema,
	proposedStepSchema,
	runOutcomeSchema,
	usageSchema,
	type AssistantToolCall,
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
	groupRunRecordSchema,
	migrateAgentRecord,
	parseAgentRecord,
	safeParseAgentRecord,
	safeParseStoredEvent,
	storedEventSchema,
	type AgentRecord,
	type GroupRunRecord,
	type StoredEvent
} from './schemas/records.js';

// The persistence seam (07-DATA-MODEL-PERSISTENCE.md §8; WP36 stage A,
// 26-TARGET-DESIGN-V3.md §6.7): the contract every host stores runs through,
// plus the in-memory implementation. IndexedDB stays in the workbench.
export {
	DEFAULT_RUN_CAP,
	byNewestFirst,
	emptyQuarantine,
	selectRunsToEvict,
	type QuarantineReport,
	type Storage
} from './storage/storage.js';
export { createMemoryStorage, type MemoryStorage } from './storage/memory.js';

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
export { buildAgentCard, type AgentCard, type AgentCardBrick } from './persistence/agent-card.js';
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
	type BrickConfigProblem,
	type BrickRuntimeContext,
	type BrickValidationContext,
	type ControlHint,
	type ControlHints,
	type ControlSource,
	type CallContribution,
	type ContextContribution,
	type SlotId,
	type TickContext,
	type TickRecord
} from './types/brick.js';
export {
	brainSlotSchema,
	memorySlotSchema,
	safetySlotSchema,
	slotConfig,
	type BrainSlotConfig,
	type MemorySlotConfig,
	type SafetySlotConfig
} from './schemas/slot-contracts.js';
export { validateSpec } from './validate-spec.js';
export { validateSpecV2 } from './validate-spec-v2.js';

// The running engine (02-AGENT-MODEL.md §5)
export { createSession } from './session/agent-session.js';
// Multi-agent core (WP29, `23-MULTI-AGENT-DESIGN.md` §4.4, stage C)
export { createGroupTokenBudgetGuardrail, createSessionGroup } from './session/session-group.js';
export type {
	CreateSessionGroup,
	CreateSessionGroupDeps,
	GroupMember,
	SessionGroup
} from './types/session-group.js';
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
	collectCalls,
	collectContext,
	collectGuardrails,
	collectSenses,
	disposeRuntimes,
	notifyTickEnd,
	type BuildRuntimesOptions,
	type FittedRuntime
} from './session/brick-runtimes.js';
export {
	createMemory,
	createWindowMemory,
	summariseWindow,
	type Memory,
	type MemoryStrategy,
	type TickMemory
} from './session/memory.js';
export {
	composePrompt,
	composeSystemMessage,
	describeFittedBricks,
	estimateTokens,
	sectionsPromptStrategy,
	transcriptPromptStrategy,
	type PromptInput,
	type PromptStrategy
} from './session/prompt.js';
export {
	DEFAULT_STRATEGY,
	resolveStrategies,
	type Strategies,
	type StrategyName
} from './session/strategies.js';
export {
	isAllowed,
	isPause,
	runGuardrailChain,
	type ChainOutcome
} from './session/guardrail-chain.js';
