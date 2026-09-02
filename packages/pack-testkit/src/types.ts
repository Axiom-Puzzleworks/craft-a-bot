import type {
	ActionCall,
	AnyAgentSpec,
	CartridgeDefinition,
	Guardrail,
	GuardrailContext,
	EvaluationInput,
	PackManifest,
	ScreenRequest
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
export interface PackConformanceFixture {
	manifest: PackManifest;
	/** Other packs to register alongside this one before any check runs — a cartridge pack a brain brick resolves against, say. */
	companionPacks?: PackManifest[];
	world?: WorldConformanceFixture;
	tools?: ToolConformanceFixture;
	guardrails?: GuardrailConformanceFixture;
	/** One per service the manifest ships, keyed by service id (`29-…` §4.7). */
	guardrailServices?: Record<string, GuardrailServiceConformanceFixture>;
	/** One per evaluator the manifest ships, keyed by evaluator id (`31-…` §4.4). */
	evaluators?: Record<string, EvaluatorConformanceFixture>;
	goldenTrace?: GoldenTraceConformanceFixture;
}

export type { CartridgeDefinition };
