import type {
	ComponentDeps,
	ComponentVerdictKind,
	GuardPoint,
	ContextSpec,
	Injection,
	ActionCall,
	AnyAgentSpec,
	CartridgeDefinition,
	Guardrail,
	GuardrailContext,
	EvaluationInput,
	EvidenceItem,
	PackManifest,
	ScreenRequest,
	TraceExport
} from '@craftabot/core';
import type { MockScript } from '@craftabot/core/testing';

/**
 * **The pack-conformance kit** (`@craftabot/pack-testkit`, `13-…` §7, WP21).
 *
 * A published test suite any pack can run against its own content — the
 * mechanical half of "re-usable" (`13-…` §1): the same checks starter and
 * openai pass are the ones a brand-new expansion pack has to pass too, and a
 * pack fails them the same way regardless of who wrote it.
 *
 * **Two of the six `13-…` §7 bullets check machinery that has not landed
 * yet**, and this kit does not fake them:
 *
 * - *"semver ranges evaluated (D13)"* — no evaluator exists anywhere in
 *   `core`; `requiresCore` is stored as a non-empty string and never parsed.
 *   `checkManifest` validates presence, nothing more.
 * - *"cartridge defaults consumed (post-`14-…` §4.1)"* — `14-…` §4.1 has not
 *   shipped; nothing in the engine reads `.defaults.temperature` or
 *   `.defaults.maxTokens`. `checkCartridge` validates the catalogue entry's
 *   shape, nothing more.
 *
 * See the dated amendment in `13-…` §7 for the full accounting.
 */

/** One thing a pack failed to satisfy. Nothing throws — every check collects these instead. */
export interface ConformanceIssue {
	/** A dotted check id, e.g. `"world.determinism"` — stable enough to grep for. */
	check: string;
	message: string;
	detail?: unknown;
}

/**
 * A world action sequence and the layout it plays out on.
 *
 * `calls` name what `WorldInstance.perform` expects — a world's own internal
 * action id (`"move"`), not the qualified id it advertises on
 * `WorldDefinition.actions` (`"starter/playroom/move"`). Qualification is a
 * session-level concern (E6); a world's own `perform` has never needed it,
 * because a world resolves its own content by its own names.
 */
export interface WorldScriptFixture {
	layoutId: string;
	calls: ActionCall[];
	/** The world's create-time config (WP78) — `{ knobs }` — so a predicate a knob turns on is reachable by a script. */
	config?: Record<string, unknown>;
}

/** A call the world must refuse cleanly — never thrown, never silently allowed. */
export interface WorldIllegalCallFixture {
	layoutId: string;
	call: ActionCall;
}

export interface WorldConformanceFixture {
	/** Which of the manifest's worlds to exercise. */
	worldId: string;
	/**
	 * One script per thing worth reaching — typically one per goal card. Run
	 * twice each (determinism) and their predicate observations are pooled
	 * (reachability): every predicate the world declares must go true in at
	 * least one of them.
	 */
	scripts: Record<string, WorldScriptFixture>;
	illegalActions: WorldIllegalCallFixture[];
	/**
	 * Top-level `WorldState` keys a legal turn is allowed to change even when
	 * the action itself is illegal — a turn-based world's own clock, typically.
	 *
	 * `13-…` §7 says an illegal action "never mutates"; the Playroom's own
	 * `perform` advances `state.tick` unconditionally, legal or not, because
	 * turns are turns even when wasted. That is a deliberate, documented
	 * design (`world/playroom.ts`), not a violation — so the no-mutation check
	 * excludes whatever keys a world names here rather than either accepting
	 * every mutation or failing an honest one. See `13-…` §7's dated amendment.
	 */
	volatileStateKeys?: string[];
}

/** Example arguments for a tool, valid enough that `execute` should succeed. */
export interface ToolConformanceFixture {
	examples: Record<string, unknown>;
}

/** A configured guardrail instance and one representative context to run it against. */
export interface GuardrailConformanceEntry {
	guardrail: Guardrail;
	context: GuardrailContext;
}

export interface GuardrailConformanceFixture {
	guardrails: GuardrailConformanceEntry[];
}

/**
 * A hosted guardrail service's own fixture (`29-GUARD-SHELL.md` §4.7, WP39):
 * a config its `configSchema` accepts, requests its offline client must
 * answer, and a secret that must never leak. Keyed by service id in
 * `PackConformanceFixture.guardrailServices`.
 */
export interface GuardrailServiceConformanceFixture {
	config: unknown;
	/** At least one per hook the service supports. */
	requests: ScreenRequest[];
	/** Planted as the credential; must not appear in any result. */
	plantedSecret: string;
}

/** One verdict a component's fixture can produce: the context that produces it, at a point. */
export interface ComponentVerdictProbe {
	verdict: ComponentVerdictKind;
	context: GuardrailContext;
	/** The fixture's first point when absent. */
	point?: GuardPoint;
}

/**
 * A guardrail component's fixture (WP94, `85-COMPONENTS.md` §7): a config its
 * schema accepts, the points to compile at (every declared point when absent),
 * the verdicts it can be made to give, and the deps `compile` may ask for —
 * the driver fills `deps` from the registry it built when a fixture omits them.
 * Keyed by component id in `PackConformanceFixture.guardrailComponents`.
 */
export interface ComponentConformanceFixture {
	config: unknown;
	points?: GuardPoint[];
	verdicts?: ComponentVerdictProbe[];
	deps?: ComponentDeps;
}

/**
 * An evaluator's fixture (`31-EVALUATORS.md` §4.4, WP43): inputs it is run
 * over, its config, and a secret that must never reach a result. Keyed by
 * evaluator id in `PackConformanceFixture.evaluators`.
 */
export interface EvaluatorConformanceFixture {
	inputs: EvaluationInput[];
	config?: unknown;
	plantedSecret: string;
}

/**
 * A service line's fixture (WP58, `47-SERVICE-LINES.md` §4.3): example
 * arguments per operation for `simulate` and `live`, the world state a
 * simulation reads, the pack id its tools carry, and a secret that must
 * never reach a result or a cassette. Every field optional — a line with no
 * entry is checked with the defaults.
 */
export interface ServiceLineConformanceFixture {
	/** Default: the prefix of the line's id. */
	packId?: string;
	/** Arguments per operation id; default `{}` for every operation. */
	examples?: Record<string, unknown>;
	worldState?: Record<string, unknown>;
	plantedSecret?: string;
}

/** A trace sink (WP47, `35-TELEMETRY.md` §4.4): a config it accepts, a finished run to attach and export, a secret that must never leak. */
/** What `checkEvidenceStore` needs (`58-EVIDENCE-STORE.md` §4.2, WP70). */
export interface EvidenceStoreConformanceFixture {
	config: unknown;
	/** An item of every kind the suite should round-trip; at least one. */
	items: readonly EvidenceItem[];
	plantedSecret: string;
	/**
	 * `false` for a store that never calls out (the memory store): the suite
	 * then round-trips with the refusing fetch and expects every push to land.
	 * `true` (the default): a refused network must reject `push` with a
	 * message that carries no secret, and `verify` must reject rather than lie.
	 */
	expectsNetwork?: boolean;
}

export interface SinkConformanceFixture {
	config: unknown;
	input: TraceExport;
	plantedSecret: string;
	/** `false` for a sink that never calls out (a file sink): a refused network is then not expected to count as a failure. */
	expectsNetwork?: boolean;
}

/** A scripted run through the whole stack, checked for catalogue-only events. */
export interface GoldenTraceConformanceFixture {
	spec: AnyAgentSpec;
	script: MockScript;
	/** Stop after this many `step()` calls. Defaults to 40. */
	maxSteps?: number;
}

/**
 * What a pack hands the kit to be exercised against. Every category but the
 * manifest itself is optional — a cartridges-only pack (`openai`) supplies
 * none of `world`/`tools`/`guardrails`/`goldenTrace`, and `describeConformance`
 * skips whatever a fixture omits rather than failing it for content it never
 * shipped.
 */
/**
 * What `checkDesk` (WP53 stage C, `43-DESK-WORLDS.md` §4.8) is told about a
 * desk. Everything is optional: a desk with no fixture at all is still
 * checked for its shape, its tiers, its purity over its senses, its reset
 * and its injection doors. Scripts and illegal calls also run it through
 * `checkWorld`.
 */
export interface DeskConformanceFixture {
	/** Which layouts to exercise; default every one the world declares. */
	layoutIds?: string[];
	/** The rungs of the context ladder to prove the superset property over (WP81, `70-…` §4); the four plain rungs when absent. */
	contexts?: ContextSpec[];
	/** The desk's purpose, when the definition does not carry it (`createDeskWorld` leaves it on `spec`). */
	purpose?: string;
	/** The injection kinds the desk takes; default all four. A kind it declines must leave it unchanged. */
	acceptedInjections?: Injection['kind'][];
	scripts?: Record<string, WorldScriptFixture>;
	illegalActions?: WorldIllegalCallFixture[];
	/** Default `['tick', 'heardCursor']` — the runtime's own clock and cursor. */
	volatileStateKeys?: string[];
}

export interface PackConformanceFixture {
	manifest: PackManifest;
	/** Other packs to register alongside this one before any check runs — a cartridge pack a brain brick resolves against, say. */
	companionPacks?: PackManifest[];
	world?: WorldConformanceFixture;
	tools?: ToolConformanceFixture;
	guardrails?: GuardrailConformanceFixture;
	/** One per service the manifest ships, keyed by service id (`29-…` §4.7). */
	guardrailServices?: Record<string, GuardrailServiceConformanceFixture>;
	/** One per guardrail component the manifest ships, keyed by component id (WP94, `85-…` §7). */
	guardrailComponents?: Record<string, ComponentConformanceFixture>;
	/** How the manifest's stacks are checked (WP97, `89-…` §7): `resolve: false` when the components they name ship in packs the fixture's companions do not include. */
	stacks?: { resolve?: boolean; browser?: boolean };
	/** One per evaluator the manifest ships, keyed by evaluator id (`31-…` §4.4). */
	evaluators?: Record<string, EvaluatorConformanceFixture>;
	goldenTrace?: GoldenTraceConformanceFixture;
	/** One per desk world the manifest ships, keyed by world id (WP53); a desk without an entry is checked with the defaults. */
	desks?: Record<string, DeskConformanceFixture>;
	/** One per service line the manifest ships, keyed by line id (WP58); a line without an entry is checked with the defaults. */
	serviceLines?: Record<string, ServiceLineConformanceFixture>;
	/** How the manifest's control maps are resolved (WP67): the host's own guardrail ids and the tag vocabularies. */
	controlMaps?: {
		knownGuardrails?: readonly string[];
		knownTags?: readonly string[];
		resolve?: boolean;
	};
	/** The enums a calibration row's categories must match, by row id (WP74). */
	calibrations?: { enums?: Readonly<Record<string, readonly string[]>> };
}

export type { CartridgeDefinition };
