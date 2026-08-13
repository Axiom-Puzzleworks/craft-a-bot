import type { ZodType } from 'zod';
import type { BuildProblem } from '../schemas/build-problem.js';
import type { Guardrail } from './guardrail.js';

/**
 * **The open brick contract** (`14-…` §2, closing `12-…` D11).
 *
 * Until now "brick" was a taxonomy, not an extension point: `AgentSpec` had a
 * fixed six-key object, `kind` was a closed enum in core, and `BrickDefinition`
 * carried no config schema. A pack could contribute *content* — tools, worlds,
 * cartridges, goal cards — but not a new kind of brick. That is the single
 * structural decision behind the whole ages 5–11 kit line: planner, monitor,
 * radio and librarian bricks are either an addition or a rewrite, and this file
 * is what makes them an addition.
 *
 * The division of labour, from `14-…` §2: **core owns the loop, the hook points
 * and the six slot families; packs own brick kinds.** A brick kind cannot patch
 * another brick, reorder the loop, or reach past its own hooks — those are
 * deliberate `core` changes (hard rule 4), not pack tricks.
 */

/**
 * The six socket families on the chassis (`14-…` §2.3).
 *
 * Named for the body, because the piece-fits-hole affordance is the whole
 * point of a construction toy: a brick that goes in the head is a brain, one
 * that goes on the belt is equipment. Many *kinds* may share a family — that is
 * what makes an expansion pack possible — while V1 keeps the teaching-aid rule
 * of one brick per slot.
 */
export const SLOT_IDS = [
	'brain',
	'perception',
	'memory',
	'equipment',
	'mobility',
	'safety'
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/**
 * Migrating a brick's own config, keyed by the version being migrated *from* —
 * the same table shape kit files and traces use (`07-…` §6).
 *
 * A brick kind owns its config's history, because nobody else can: core has
 * never seen the shape, and the pack that shipped v1 of a Planner brick is the
 * only thing that knows what its v2 means.
 */
export type BrickConfigMigration = (raw: Record<string, unknown>) => Record<string, unknown>;
export type BrickConfigMigrationTable = Record<number, BrickConfigMigration>;

/**
 * What a brick may add to the prompt — the Sense and Memory contribution.
 *
 * > **Note (WP14 slice 3a):** `sections` land in the **system message**, between
 * > the preamble and the goal. That is the right home for what a brick *is*
 * > (the Brain brick's personality) and the wrong one for what it *knows this
 * > turn* — the memory window and the current observation are separate messages,
 * > so the Flight Recorder can label them *system / memory / observation* as
 * > `03-…` §5.2 promises. Placement arrives with those two bricks in slice 3c,
 * > as a deliberate widening of this shape rather than a convention nobody
 * > wrote down.
 */
export interface ContextContribution {
	/**
	 * Prompt sections, in the order the brick wants them. Additive only: a
	 * brick contributes its own lines and cannot rewrite anybody else's, which
	 * is what keeps the composed prompt readable in the trace.
	 */
	sections?: string[];
}

/**
 * What a brick offers the model to call — the Equipment and Mobility
 * contribution (`14-…` §2.1).
 *
 * **Ids, not schemas.** `14-…` §2.1 sketched this as returning call schemas,
 * which cannot work as drawn: a schema with no executor is a name the model can
 * call and nothing can answer. The brick names *which registered content* it
 * offers, and core dispatches it — through `ToolDefinition` and
 * `WorldActionDefinition`, both of which are core's own types.
 *
 * That keeps the contract fully open without a second dispatch mechanism. A
 * Radio brick ships a pack registering both a `radio/send_message` tool and the
 * brick kind whose config enables it; no core change, and the tool arrives with
 * its executor already attached the way every tool does.
 *
 * Ids may be qualified (`starter/calculator`) or bare (`move`), the latter
 * resolving only while exactly one piece of content answers to it (E6).
 */
export interface CallContribution {
	/** Registered tool ids this brick puts on the belt. */
	toolIds?: string[];
	/** World action ids this brick gives the bot a way to perform. */
	actionIds?: string[];
}

/** What the loop hands a runtime at each tick. */
export interface TickContext {
	tick: number;
	/** The channels the perception brick asked for, if any. */
	channels: readonly string[];
}

/** What happened in a tick, handed to bricks that learn from it. */
export interface TickRecord {
	tick: number;
	observation: string;
	thought: string;
	action?: string;
	result?: string;
	refused?: string;
}

/**
 * A fitted brick's live behaviour. Every hook is optional and additive: a brick
 * contributes only what it is. The Safety brick contributes guardrails and no
 * prompt; the Sense brick the reverse.
 */
export interface BrickRuntime {
	/** Prompt sections (Sense, Memory). */
	contributeContext?(tick: TickContext): ContextContribution;
	/** Tools and actions offered to the model (Equipment, Mobility). */
	contributeCalls?(): CallContribution;
	/**
	 * Which of the world's sense channels this brick opens (Perception).
	 *
	 * Ids, for the same reason `contributeCalls` returns ids: the *world* owns
	 * what can be perceived and how, and a brick that returned observations
	 * would be a second way of seeing alongside `WorldInstance.observe`. A
	 * Radar brick opens `radar/sweep`; the world it is used in decides what a
	 * sweep shows.
	 */
	contributeSenses?(): string[];
	/** Policy (Safety, and later Monitor). */
	contributeGuardrails?(): Guardrail[];
	/** Learn or record once the tick has resolved (Memory). */
	onTickEnd?(record: TickRecord): void;
	dispose?(): void;
}

/** What a runtime is given when it is built. */
export interface BrickRuntimeContext {
	/** Deterministic randomness, so a brick cannot smuggle in `Math.random`. */
	random(): number;
}

/**
 * What a kind may ask about the workbench while checking its own config
 * (WP14 slice 3d).
 *
 * Four questions, not the registry itself. A brick has no business enumerating
 * what is installed — it has business knowing whether the thing *it names*
 * is there, which is the difference between a check and a search.
 */
export interface BrickValidationContext {
	hasTool(id: string): boolean;
	hasAction(id: string): boolean;
	hasSenseChannel(id: string): boolean;
	hasCartridge(id: string): boolean;
}

/**
 * A problem a brick found in its own config, for the build-checks ribbon.
 *
 * `slot` is core's to fill in — the brick knows what is wrong, core knows where
 * on the chassis it is.
 */
export type BrickConfigProblem = Omit<BuildProblem, 'slot'>;

/**
 * What a pack registers to define a kind of brick.
 *
 * `configSchema` is the source of truth for the config's type *and* for the
 * bench's controls: `15-…` §5 replaces the workbench's if/else panel chain with
 * schema-driven rendering, so a new brick kind arrives with working controls
 * and needs no UI change. `defaults` is likewise single-sourced — it retires
 * the `BRICK_DEFAULTS` duplicate the workbench has been carrying.
 */
export interface BrickKindDefinition<C = unknown> {
	/** Qualified and stable forever, like every content id (`01-…` §4). */
	id: string;
	slot: SlotId;

	/** The toy face and the real face, both required (`00-…` §6). */
	name: string;
	description: string;
	realName: string;
	realExplanation: string;

	configSchema: ZodType<C>;
	configVersion: number;
	migrateConfig?: BrickConfigMigrationTable;
	/** What a freshly-snapped brick gets. */
	defaults: C;

	/**
	 * How this brick describes *itself as configured*, for the "parts you have
	 * been built with" line the bot reads in its own prompt.
	 *
	 * Distinct from `name` because the answer depends on the config: a Memory
	 * brick says how many turns it remembers and whether it has a notebook. An
	 * empty string means "fitted, but not worth mentioning" — an Equipment brick
	 * with no tools ticked is on the chassis and carrying nothing.
	 *
	 * Presentation, like `name` and `description`, so it lives on the kind
	 * rather than in a hook: it is what the brick *is*, not something it does
	 * during a tick. A kind that omits it falls back to `name`.
	 */
	describeFitted?(config: C): string;

	/**
	 * Anything wrong with this config that the schema cannot express (WP14
	 * slice 3d).
	 *
	 * `validateSpec` asks three questions of every brick — is the kind installed,
	 * does it fit this socket, does its config parse — and delegates the fourth
	 * to the kind, because the kind is the only thing that knows what its config
	 * *means*. A Safety Brick blocklist naming an action nobody installed is
	 * perfectly well-formed and still wrong, and core has no way to tell.
	 *
	 * For ids a brick *offers*, prefer the runtime hooks: core already checks
	 * everything `contributeCalls` and `contributeSenses` return, so a brick that
	 * re-checks them here says everything twice. This is for the rest — ids a
	 * config merely refers to.
	 */
	validateConfig?(config: C, ctx: BrickValidationContext): BrickConfigProblem[];

	/** A brick with no runtime is pure configuration — legal, and occasionally right. */
	createRuntime?(config: C, ctx: BrickRuntimeContext): BrickRuntime;
}
