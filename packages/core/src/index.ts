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
export type {
	BrickSlot,
	BuildProblem,
	BuildProblemCode,
	BuildProblemSeverity
} from './types/build-problem.js';

// Schemas (Zod-first types — 07-DATA-MODEL-PERSISTENCE.md §6)
export {
	agentSpecSchema,
	parseAgentSpec,
	safeParseAgentSpec,
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
export {
	kitFileSchema,
	migrateKitFile,
	parseKitFile,
	safeParseKitFile,
	type KitFile,
	type MigrationError
} from './schemas/kit-file.js';
export {
	computeTraceDigest,
	parseTraceFile,
	runRecordSchema,
	safeParseTraceFile,
	traceFileSchema,
	type RunRecord,
	type TraceFile
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
export { validateSpec } from './validate-spec.js';

// The running engine (02-AGENT-MODEL.md §5)
export { createSession } from './session/agent-session.js';
export {
	DEFAULT_REQUEST_TIMEOUT_MS,
	DEFAULT_TICK_BUDGET,
	DEFAULT_TOKEN_BUDGET,
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
