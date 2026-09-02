import type { ZodType } from 'zod';
import type { BuildProblem } from '../schemas/build-problem.js';
import type { PolicyCard } from '../schemas/policy-card.js';
import type { AssertionCard } from '../schemas/assertion-card.js';
import type { Evaluator } from './evaluator.js';
import type { EgressDeclaration, GuardrailService } from './guardrail-service.js';
import type { Guardrail } from './guardrail.js';
import type { KeyCheck } from './provider.js';
import type { Observation, WorldActionDefinition } from './world.js';

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
 * The socket families on the chassis (`14-…` §2.3).
 *
 * Named for the body, because the piece-fits-hole affordance is the whole
 * point of a construction toy: a brick that goes in the head is a brain, one
 * that goes on the belt is equipment. Many *kinds* may share a family — that is
 * what makes an expansion pack possible — while V1 keeps the teaching-aid rule
 * of one brick per slot.
 *
 * > **Amended 2026-08-20 (WP30 stage A):** `'planner'` joins the original six
 * > — the first socket added since the open contract shipped. Nothing can fit
 * > it yet; no `BrickKindDefinition` claims it until WP30 stage B. Adding the
 * > `SlotId` here is what forces every `Record<SlotId, …>` in the codebase to
 * > account for it at compile time, which is the whole reason this lands as
 * > its own dormant stage rather than alongside the brick that first uses it —
 * > the same "prove the seam first" discipline `23-…`'s own stage A and B held
 * > to before `SessionGroup` was built on top of them.
 *
 * > **Amended 2026-08-20 (If/Then sizing, stage B, correcting stage B's own
 * > opening claim):** `'reflexes'` joins as a ninth socket. Sizing this brick
 * > called the socket question "cheap — `mobility` has no slot contract, so
 * > If/Then can register there alongside Actions, the same 'equipment' shape
 * > WP31 proved for Radio + Tools." That reasoning was wrong in a way a build
 * > check caught immediately: `equipment` holding two *registered kinds* has
 * > always meant a builder can choose *either* Tools *or* Radio for the one
 * > equipment socket — never both fitted at once (V1's one-brick-per-socket
 * > rule, `14-…` §2.3, applies to a socket regardless of which kind is in it).
 * > If/Then and Actions are not a choice; a bot needs both at once — Actions
 * > to have anything to *do*, If/Then to react instead of thinking through it
 * > — so sharing `mobility` was never actually available, and the honest
 * > answer turns out to be the one Planner already set the precedent for: a
 * > genuinely new, dormant socket.
 */
export const SLOT_IDS = [
	'brain',
	'planner',
	'perception',
	'memory',
	'equipment',
	'mobility',
	'reflexes',
	'safety'
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

/**
 * **How many bricks a socket holds** (`26-TARGET-DESIGN-V3.md` §6.13, WP40).
 * One everywhere but `safety`, which holds four — the defence-in-depth stack
 * a campaign wants to name: the local floor, an observer, a hosted
 * classifier, a policy decision point. The engine never needed the limit
 * (`collectGuardrails` runs every fitted brick in slot order, then fitted
 * order); the validator reads it, and the Kit's bench keeps its one well
 * per socket as a *bench* rule — the Spec Lab is where a stack is fitted.
 */
export const SLOT_CAPACITY: Record<SlotId, number> = {
	brain: 1,
	planner: 1,
	perception: 1,
	memory: 1,
	equipment: 1,
	mobility: 1,
	reflexes: 1,
	safety: 4
};

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

/**
 * What the loop hands a runtime when it checks for a reflex (WP30 stage A,
 * If/Then) — `TickContext` plus the observation a rule needs to evaluate
 * "IF you see X". Not folded into `TickContext` itself: `contributeContext`
 * never needed the observation (the loop composes it into its own message),
 * and widening the shape everything else already takes would be a change to
 * every existing hook for the sake of the one new one.
 */
export interface ReflexContext extends TickContext {
	observation: Observation;
}

/**
 * A reflex a brick proposes instead of asking the brain (WP30 stage A,
 * If/Then) — always a call, never "nothing": returning `undefined` from the
 * hook itself is how a brick says no reflex applies this tick.
 */
export interface ReflexProposal {
	kind: 'tool' | 'action';
	name: string;
	arguments: unknown;
	/**
	 * Stands in for the brain's own thought in the trace and the prompt
	 * history — a reflex still owes the reader *why*, even though nothing
	 * reasoned about it this tick.
	 */
	thought: string;
}

/** What happened in a tick, handed to bricks that learn from it. */
export interface TickRecord {
	tick: number;
	observation: string;
	thought: string;
	action?: string;
	result?: string;
	refused?: string;
	/**
	 * What the model tried to call, whether or not it ran (WP30 stage B) — the
	 * same info `session/memory.ts`'s internal `TickMemory` has always kept,
	 * finally exposed to a brick's own `onTickEnd`. A brick that wants to know
	 * *which* tool or action was attempted, not just the narrated outcome, had
	 * no way to ask until now — the Planner brick is the first that needs to.
	 */
	call?: { kind: 'tool' | 'action'; name: string; arguments: unknown };
	/**
	 * Whether the attempt succeeded — a tool's own `ToolResult.ok`, or an
	 * action's `ActionResult.ok`. Undefined when nothing was called, or when a
	 * guardrail or a person refused it before it ever ran (`refused` is set
	 * instead) — "never attempted" and "attempted and failed" are different
	 * facts, and only one of this pair is ever true at once.
	 */
	ok?: boolean;
}

/**
 * A fitted brick's live behaviour. Every hook is optional and additive: a brick
 * contributes only what it is. The Safety brick contributes guardrails and no
 * prompt; the Sense brick the reverse.
 */
export interface BrickRuntime {
	/**
	 * Propose a call before the brain is ever asked (Mobility, WP30 stage A —
	 * the If/Then brick). Checked once per tick, right after SENSE: the first
	 * fitted brick (in slot order) to return a proposal wins, and the loop
	 * skips composing a prompt and calling the model entirely for that tick —
	 * genuinely zero tokens, zero latency, not merely a nudge folded into
	 * `contributeContext`'s prose.
	 *
	 * A firing reflex is still checked against `pre-think` guardrails exactly
	 * as a brain-driven tick is — a stop-run policy card's deadline, say, has
	 * to apply to every tick or a rule becomes a way around it — and its
	 * proposed call still goes through `pre-act` guardrails before it runs,
	 * for the same reason. `contributeReflex` decides *what to try*, never
	 * *whether it is allowed* — that stays entirely the guardrail chain's job.
	 *
	 * Return `undefined` when nothing applies; a brick that never implements
	 * this hook is never asked and the loop behaves exactly as it always has.
	 */
	contributeReflex?(context: ReflexContext): ReflexProposal | undefined;
	/** Prompt sections (Sense, Memory). */
	contributeContext?(tick: TickContext): ContextContribution;
	/** Tools and actions offered to the model (Equipment, Mobility). */
	contributeCalls?(): CallContribution;
	/**
	 * Where this brick's runtime sends bytes (`26-…` §6.6, WP41) — a hosted
	 * guard's service hosts, say. The session allows exactly the union of every
	 * fitted runtime's declarations and the provider's; anything else is refused.
	 */
	egress?: EgressDeclaration[];
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
	/**
	 * Config the world needs to act on a brick's behalf, keyed by whichever
	 * sense-channel or action id it concerns (WP31 stage F).
	 *
	 * `contributeCalls`/`contributeSenses` tell the world *which* ids a brick
	 * opens; some bricks also need the world to *use* per-agent config while
	 * handling them — the Radio brick's own `channel`/`allowFrom`, needed to
	 * tag an outgoing message and filter an incoming one. `AgentHandle`
	 * deliberately carries identity only, never a fitted brick's config
	 * (`types/world.ts`), so this is the door such config actually crosses:
	 * collected once per session (`collectWorldConfig`) and handed to
	 * `WorldInstance.configure?()` before the first tick, never per-call.
	 */
	contributeWorldConfig?(): Record<string, unknown>;
	/** Policy (Safety, and later Monitor). */
	contributeGuardrails?(): Guardrail[];
	/** Learn or record once the tick has resolved (Memory). */
	onTickEnd?(record: TickRecord): void;
	/**
	 * A brick's own live state, for the trace and the UI (WP30 stage C).
	 *
	 * `contributeContext`'s prose already carries this for a Planner-style
	 * brick — the checklist text sits in the prompt every tick — but prose is
	 * not something a UI can read structurally without parsing pack-specific
	 * copy, which breaks quietly the moment that copy changes. This is the
	 * structured counterpart: called once per tick, right after `onTickEnd`,
	 * opaque to core the same way `contributeWorldConfig`'s bag already is —
	 * the *shape* of the state is the brick's own business, never core's.
	 *
	 * Return `undefined` when there is nothing new to report; a brick that
	 * never implements this hook simply never appears in the `brick.state`
	 * trace, the same "additive, opt-in" contract as every hook above it.
	 */
	contributeState?(): unknown;
	dispose?(): void;
}

/** What a runtime is given when it is built. */
export interface BrickRuntimeContext {
	/** Deterministic randomness, so a brick cannot smuggle in `Math.random`. */
	random(): number;
	/**
	 * A registered policy card, by qualified id (`14-…` §4.6, WP22).
	 *
	 * Unlike a tool or action id — which a brick only *offers* and core
	 * resolves after the fact (`contributeCalls`) — a policy card must already
	 * be compiled into a live `Guardrail` by the time `contributeGuardrails`
	 * returns one, so the brick needs the card's own data, not just its id.
	 * This is that lookup, the runtime-context counterpart to
	 * `BrickValidationContext.hasPolicyCard`.
	 */
	getPolicyCard(id: string): PolicyCard | undefined;
	/**
	 * A registered world action's definition, by qualified or bare id (E6),
	 * including its `riskTier` (`14-…` §4.5, WP24). The same "needs the
	 * resolved thing, not just the id" reasoning as `getPolicyCard`: a Safety
	 * Brick set to `approval: 'risky'` has to know an action's risk tier the
	 * moment it builds its approval guardrail, not just that the id exists.
	 */
	getAction(id: string): WorldActionDefinition | undefined;
	/**
	 * The platform `fetch`, injected (`25-…` §4.6, WP35 stage C) so a brick
	 * that talks to a network is testable on canned responses the same way a
	 * provider pack already is — never the raw global, so a test can hand a
	 * fixture-backed stand-in and a live session gets the real thing.
	 */
	fetch: typeof globalThis.fetch;
	/**
	 * A secret by the id a kind declared in `BrickKindDefinition.credential`
	 * (`25-…` §4.6), read from the host's own vault at call time — never
	 * cached by the brick, the same "read it fresh, never hold it" discipline
	 * `getPolicyCard`/`getAction` already model for registry lookups. `id`
	 * that names no credential the host knows about — including every brick
	 * before this one, which declares none — returns `undefined`.
	 */
	getCredential(id: string): string | undefined;
	/**
	 * A registered hosted guardrail service (`29-GUARD-SHELL.md` §4.3, WP39),
	 * by qualified id — the `getPolicyCard` reasoning once more: a generic
	 * Guard brick must resolve the service the moment it builds its
	 * guardrails, not merely know the id exists.
	 */
	getGuardrailService(id: string): GuardrailService | undefined;
	/**
	 * A registered evaluator, or an assertion card, by qualified id (WP43,
	 * `31-EVALUATORS.md` §4.3) — what the Monitor Judge resolves at build.
	 * Optional so a host that predates the contract still builds every brick.
	 */
	getEvaluator?(id: string): Evaluator | undefined;
	getAssertionCard?(id: string): AssertionCard | undefined;
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
	/** Whether a policy card id (`14-…` §4.6, WP22) is one an installed pack registered. */
	hasPolicyCard(id: string): boolean;
	/**
	 * Whether the host's vault holds a secret under this credential id
	 * (`25-…` §4.6, WP35 stage C) — the build-time counterpart to
	 * `BrickRuntimeContext.getCredential`, so `validateConfig` can warn
	 * "fitted but not plugged in" without the config schema ever seeing a
	 * secret's value.
	 */
	hasCredential(id: string): boolean;
	/** Whether a hosted guardrail service id (`29-…` §4.3, WP39) is one an installed pack registered. */
	hasGuardrailService(id: string): boolean;
	/** Whether an evaluator or assertion card id (WP43) is one an installed pack registered. Optional as above. */
	hasEvaluator?(id: string): boolean;
}

/**
 * A problem a brick found in its own config, for the build-checks ribbon.
 *
 * `slot` is core's to fill in — the brick knows what is wrong, core knows where
 * on the chassis it is.
 */
export type BrickConfigProblem = Omit<BuildProblem, 'slot'>;

/**
 * Where the choices in a picker come from (WP14 slice 4a).
 *
 * The one thing a config schema provably cannot say. `enabled: z.array(z.string())`
 * means "some strings"; that they are *installed tool ids*, or *the actions of
 * the world this bot's goal card names*, is nowhere in the type and cannot be —
 * the answer changes when the user swaps the card. So a hint names a content
 * type core already owns, and the workbench resolves it.
 *
 * Five, because these are the kinds of registered content a brick's config
 * ever refers to. A pack naming one of them is contributing *content*, not a
 * mechanism (hard rule 4): it is saying which of core's own catalogues its
 * field draws on, not inventing a way to draw on a new one.
 *
 * > **Amended 2026-08-16 (WP22):** `policyCards` joins the four from WP14 —
 * > `starter/safety`'s `policyCards` field needed the same "resolve against a
 * > catalogue the workbench, not the kind, owns" answer every other id-array
 * > field already had.
 */
export type ControlSource =
	| 'tools'
	| 'actions'
	| 'senseChannels'
	| 'cartridges'
	| 'policyCards'
	/** Registered hosted guardrail services (`29-GUARD-SHELL.md` §4.6, WP39) — what the generic Guard brick picks from. */
	| 'guardrailServices';

/**
 * How one config field should be offered to a builder.
 *
 * Presentation, so it lives on the kind beside `name` and `describeFitted`, and
 * it is entirely optional: a kind that declares none still gets working controls
 * inferred from its schema. What the hints buy is *kit-quality* controls — a
 * dial that says "relaxed" rather than a spinner that says 1.4 — which is the
 * difference between an expansion brick that fits the toy and one that looks
 * like a settings dialogue somebody left in it.
 */
export interface ControlHint {
	/**
	 * Which widget. Omitted means "infer from the schema", which is what an
	 * unhinted field gets anyway.
	 */
	control?: 'dial' | 'switch' | 'checklist' | 'choice' | 'text' | 'number';
	/** The label a builder reads. Falls back to the field name. */
	label?: string;
	/** A line under the control, in the register the brick's `description` uses. */
	hint?: string;
	/**
	 * For `checklist` and `choice`: which of core's catalogues the options come
	 * from.
	 *
	 * Omit it and declare `options` instead when the choices are the *pack's own*
	 * content — a Monitor brick's watch rules, say — which no catalogue of core's
	 * has.
	 */
	source?: ControlSource;
	/**
	 * The options themselves, where the kind rather than a catalogue supplies
	 * them.
	 *
	 * A `choice` maps value → label ("Goldfish (3 turns)"). A `dial` reads them
	 * as ascending bands — the first whose `value` the setting has not passed
	 * supplies the word. A `checklist` with no `source` ticks these directly,
	 * which is how a brick offers a set of its own ids.
	 */
	options?: ReadonlyArray<{ value: unknown; label: string }>;
}

/**
 * A kind's control hints, by config field name.
 *
 * **The known limit** (`14-…` §2.1), stated so it is a decision rather than a
 * wall somebody hits. Two things the shipped starter panels do cannot be said
 * here: a field that appears only when another is set (the Safety Brick's
 * repeat limit), and a control whose text depends on a *different brick* (a
 * notebook tool warning that the Memory brick's notebook is off). Both are
 * real, both are rare, and both are why `14-…` §2.1 keeps per-kind panel
 * overrides in the workbench alongside this. When an expansion brick genuinely
 * needs one, the answer is to widen this deliberately — a `when` predicate is
 * the obvious shape — and not to reach for an override, which the workbench
 * cannot install on a pack's behalf anyway.
 */
export type ControlHints = Record<string, ControlHint>;

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
	 * How this kind's config fields should be offered on the bench (WP14
	 * slice 4a).
	 *
	 * Optional, and the bench works without it: a kind with no hints gets
	 * controls inferred from `configSchema`, which is what makes a new brick
	 * arrive with working controls and no UI change. Hints are how it arrives
	 * with *good* ones.
	 */
	controlHints?: ControlHints;

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

	/**
	 * A secret this kind needs (`25-…` §4.6, WP35 stage C) — the Armour
	 * Brick's own OAuth token is the first, but the shape is generic: any
	 * kind that talks to a host outside the browser declares one. The host
	 * lists it in Settings beside the providers' own batteries, under `id`;
	 * `BrickRuntimeContext.getCredential(id)` and
	 * `BrickValidationContext.hasCredential(id)` are how a kind reads it and
	 * checks for it. Omitted for every kind that needs no credential — which
	 * is every kind before this one.
	 */
	credential?: {
		id: string;
		name: string;
		/**
		 * `api-key` — a long-lived key pasted in; `oauth-token` — obtained by a
		 * sign-in flow, and timed; `bearer-token` (WP41, `26-…` §6.11) — an opaque
		 * token pasted in, timed or not; `header` — an arbitrary named header
		 * value, which is how several enterprise services authenticate.
		 */
		kind: 'api-key' | 'oauth-token' | 'bearer-token' | 'header';
		/** For `header`: the header's name. Omitted for every other kind. */
		headerName?: string;
		keysUrl?: string;
		/**
		 * Check a secret against the real service. `config` (WP41) is the
		 * fitted component's own service block — a project, region and
		 * template, say — which a check that has to *use* the credential
		 * needs and could not have before (`25-…` §8 stage E finding 2).
		 */
		validate?(secret: string, fetch: typeof globalThis.fetch, config?: unknown): Promise<KeyCheck>;
	};

	/**
	 * Who this kind is offered to (`25-…` §4.6/§4.8, WP35 stage C). Omitted
	 * means `'kit'` — every kind before this one, and the default for any
	 * kind that says nothing. A `'workshop'` kind still validates and runs
	 * anywhere a kit file carrying it is opened; only the *offering* — the
	 * parts tray, the Settings credential compartment — is gated on the
	 * Workshop door being open (`preferences.workshop`), never the engine.
	 * `15-…` §4's "the Kit never gets a capability the Workshop lacks" was
	 * always a superset rule; this is that superset expressed on a bench the
	 * two modes otherwise share byte-for-byte.
	 */
	audience?: 'kit' | 'workshop';
}
