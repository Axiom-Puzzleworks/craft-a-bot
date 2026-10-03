import type { ActionCall, WorldState } from './world.js';
import type { JsonSchema } from './json-schema.js';
import type { Book, WorkItem, WorkItemKind } from '../schemas/book.js';
import type { ContextSpec } from './context.js';
import type { CalibrationRef } from './error-model.js';
import type { TypedAnswer, TypedQuestion } from '../schemas/reader.js';
import type { Corpus } from '../schemas/corpus.js';

/**
 * **Workflows** (WP79, `69-WORKFLOWS.md` §3; `64-TARGET-DESIGN-V5.md` §6.2,
 * tenet 21): a journey as a sequence of stages with typed input and
 * output, each with an executor — a rule, the bot, a person, a service
 * line — that a configuration may override. A workflow is a schedule over
 * what a desk already does; the runtime is `@craftabot/workflow`. Declared
 * here because a pack ships one (`PackManifest.workflows`) and the record
 * of a run (`schemas/workflow-run.ts`) names its executors.
 */
export type Executor =
	| { kind: 'rule'; rule: string }
	/** The bot on a card whose success condition is `until`; `goalText` is what the card tells it, default `${purpose} — ${name}.` */
	| { kind: 'agent'; until: string; maxTicks?: number; goalText?: string }
	| { kind: 'human'; prompt: string; options: string[]; default?: string }
	| {
			kind: 'line';
			lineId: string;
			operation: string;
			arguments?: (input: unknown, state: WorldState) => unknown;
	  }
	| ReaderExecutor;

/**
 * **The `reader` executor** (WP117, `104-READERS.md` §4; `100-…` §6.3, D16):
 * a registered reader asked typed questions about what the stage shows it;
 * at or above the gate's threshold its output is committed, below it the
 * `else` executor (a rule or a person) takes the same input under the same
 * stage. A rule reader answers at confidence 1 and never gates.
 */
export interface ReaderExecutor {
	kind: 'reader';
	readerId: string;
	/**
	 * The question set's id (WP119, `105-CORPORA.md` §5): what a corpus's
	 * `seenBy` records, and what the held-out rule matches. A reader scored on a
	 * corpus must name one.
	 */
	questionSet?: string;
	/** What the reader is shown — the caller's words, a claim's figures. Never truth. */
	subject: (input: unknown, state: WorldState) => unknown;
	questions: (input: unknown, state: WorldState) => Record<string, TypedQuestion>;
	/** The stage's output from the answers. */
	output: (answers: Record<string, TypedAnswer>, input: unknown) => unknown;
	/** What committing the output does on the desk — the rule's `call` — if anything. */
	act?: (output: unknown, input: unknown, state: WorldState) => ActionCall | undefined;
	gate?: ReaderGate;
}

export interface ReaderGate {
	/** Acts when the lowest choice/score confidence is at or above this; `null` is below every threshold. */
	threshold: number;
	/** What takes the item below the threshold, or on a steer: a rule or a person. */
	else: Extract<Executor, { kind: 'rule' | 'human' }>;
	/** A noul question's id: P ≥ 0.5 routes to `else` whatever the confidence. */
	steer?: string;
}

export interface StageSpec<In = unknown, Out = unknown> {
	id: string;
	name: string;
	input: JsonSchema;
	output: JsonSchema;
	/** The default; a `WorkflowConfig.executors[id]` overrides it. */
	executor: Executor;
	/**
	 * What runs at this stage's boundaries (WP95, `69-…` §10; `83-…` §6.2.3, D11):
	 * `components` at `stage-in` (over the validated input) or `stage-out` (over
	 * the validated output), whatever the executor; `policyCards` is sugar for
	 * `policy-card` components at `stage-in`. Compiled by the host.
	 */
	guards?: { policyCards?: string[]; components?: StageGuardComponent[] };
	/** The stage commits something — disburse, freeze, file a SAR. */
	irreversible?: boolean;
	/** The obligations this stage answers for (WP88, `79-…` §3) — the Conduct lens opens the Pipeline here for them. */
	obligations?: string[];
	/**
	 * When the stage must be done by (WP146, `110-CONTROL-SUITE-PLAN.md` §10):
	 * the journey's elapsed ticks — every stage's span so far, this one's
	 * included — at most `ticks`. A stage that finishes later is recorded
	 * overdue and written `stage.overdue`; the regulator's timescale it
	 * answers to is cited, and the ticks-for-days mapping is the desk's
	 * stated assumption.
	 */
	deadline?: { ticks: number; cites?: readonly string[]; note?: string };
	/**
	 * What a scripted person answers at a `human` stage (WP80): the
	 * recommendation on the desk — the bot's, or the rule's verdict — so a
	 * campaign's person follows the case rather than the first option.
	 */
	suggest?: (input: In, state: WorldState, truth: unknown) => string | undefined;
	/**
	 * What the case puts in front of the person at a `human` stage (WP116,
	 * `103-FALLIBLE-ACTORS.md` §6): the answer the work so far invites — a
	 * four-eyes check invites `confirm`. A reviewer model takes it, when it is
	 * wrong, at its automation-bias rate. Absent, the first of the stage's
	 * options found among the input's own fields.
	 */
	recommended?: (input: In, state: WorldState) => string | undefined;
	/**
	 * **The answer key** (WP118, `104-READERS.md` §9): the right answer to each
	 * question a `reader` executor at this stage asks, read from the item's
	 * truth — what a campaign scores the reader's answers against for its
	 * calibration pane. Read by the scorer (`evals`) after the run, never by
	 * the runtime, so no reader and no run record ever sees it.
	 */
	answerKey?: (truth: unknown) => Record<string, string> | undefined;
	/** The stage's output read off the world once an agent or a line has done its work; a rule returns its own. */
	read?: (state: WorldState, truth: unknown) => Out | undefined;
	/** Which stage follows, or `'end'` — from this stage's output, the state and, when it matters, the input it was given. */
	/** The next stage, `'end'`, or a handoff (WP102, `83-…` §6.5.3): another journey started with the item `next` builds — the item, never the desk state. */
	next: (out: Out, state: WorldState, input: In) => StageNext;
	/**
	 * For the drawing only (WP111, `102-HONEST-BANK.md` §4): the stages a
	 * `next` that reads the case may name. The Journey Canvas draws one
	 * *depends on the case* edge to each instead of one to the stage declared
	 * after this one. The runtime never reads it.
	 */
	mayGoTo?: string[];
}

export interface StageHandoff {
	handoff: string;
	item: WorkItem;
	/**
	 * Why the item moves on (WP145, `110-CONTROL-SUITE-PLAN.md` §10): `appeal`
	 * when the customer contests an adverse decision and the target reviews
	 * it. Absent, a referral — the item belongs to another desk.
	 */
	kind?: 'appeal';
}
export type StageNext = string | 'end' | StageHandoff;

/** The two boundary points a stage guard may decide at (`85-…` §3). */
export type BoundaryPoint = 'stage-in' | 'stage-out';

/** One component fitted at a stage boundary: the component by id, its config, the point. */
export interface StageGuardComponent {
	id: string;
	config?: unknown;
	point: BoundaryPoint;
}

export type RuleFn<In = unknown, Out = unknown> = (
	input: In,
	state: WorldState,
	truth: unknown
) => { output: Out; call?: ActionCall };

export type AutonomyLevel = 1 | 2 | 3 | 4 | 5;

/** What a campaign, a book run or the monitor varies (`64-…` §6.2.1). */
export interface WorkflowConfig {
	executors?: Record<string, Executor>;
	/** Passed to the world at create as `config.knobs` (WP78). */
	knobs?: Record<string, number | string | boolean>;
	/**
	 * The thought experiment's level this configuration is, and the decision-rights ceilings it is
	 * measured against (WP80). With `enforce` (WP139, `110-CONTROL-SUITE-PLAN.md` §6) a decision the
	 * level would take above its kind's ceiling waits for a person at its stage's output — a pause,
	 * `approval.requested` on the record — instead of being counted as a breach afterwards. Off by
	 * default: the reference configurations measure.
	 */
	autonomy?: { level: AutonomyLevel; ceilings?: Record<string, AutonomyLevel>; enforce?: boolean };
	/** The rung of the context ladder the journey runs at (WP81, `70-…` §3); reaches the world at `create` as `config.context`. */
	context?: ContextSpec;
	/** A stack for the whole journey (WP97, `89-STACKS.md`): its loop fits on every agent stage's session, its boundary fits at every stage. */
	stack?: string;
	/** A stack per stage, by stage id: its boundary fits at that stage, its loop fits on that stage's session. */
	stageStacks?: Record<string, string>;
	/**
	 * The person at every `human` stage, as a model (WP115, `103-FALLIBLE-ACTORS.md`
	 * §6; `100-…` §6.2, D15): a pack's `reviewerModels` id. Absent, the stage is
	 * answered as it always was — the oracle — and nothing new is written.
	 */
	reviewer?: string;
}

/**
 * **A reviewer model** (WP115, `103-…` §6): how a person at a `human` stage
 * errs, every parameter a calibration row — cited or stated, `review: 'pending'`.
 */
export interface ReviewerModel {
	id: string;
	name: string;
	description: string;
	/** P(the answer is right) when nothing wrong is put in front of them: a `rates` row. */
	accuracy: CalibrationRef;
	/** P(they take a wrong recommendation the case puts in front of them): a `rates` row. */
	automationBias: CalibrationRef;
	/** Seconds a case takes: a `weights` row whose keys are seconds. */
	secondsPerCase: CalibrationRef;
	/**
	 * P(they say why) when they overrule what the case recommended: a `rates`
	 * row (WP156, `111-…` §4). Absent, an override carries no reason, as before.
	 */
	reasonRate?: CalibrationRef;
	/** P(they say no at an approval): a `rates` row (WP171). Absent, they never refuse. */
	refuseRate?: CalibrationRef;
	/** P(they ask a question before answering): a `rates` row (WP171). Absent, they never ask. */
	questionRate?: CalibrationRef;
	/** P(they are late — past a stage's deadline): a `rates` row (WP171). Absent, they never are. */
	lateRate?: CalibrationRef;
}

export interface WorkflowSpec {
	/** Qualified, like every content id: `{packId}/{localId}`. */
	id: string;
	name: string;
	worldId: string;
	purpose: string;
	/** How a work item becomes a case and a first input: the layout to create, the create-time config, the first stage's input. */
	intake: (item: WorkItem) => {
		layoutId: string;
		input: unknown;
		config?: Record<string, unknown>;
	};
	stages: StageSpec[];
	first: string;
	/** The pure functions `rule` executors name. */
	rules?: Record<string, RuleFn>;
	/** The obligation tags the workflow as a whole carries. */
	obligations: string[];
	/** Named configurations — the reference configurations, each an autonomy level applied to the journey. */
	configurations?: Record<string, WorkflowConfig>;
	/**
	 * The decision kind a stage's output is, for the decision-rights ceilings
	 * (WP80, `64-…` §6.2.3, §6.4.1a): `in-policy-credit-approval` for an
	 * approve, `adverse-credit-decision` for a decline; `undefined` when the
	 * stage decided nothing.
	 */
	decisionKindOf?: (stageId: string, output: unknown) => string | undefined;
	/**
	 * The book this workflow runs over (WP80, `64-…` §6.6.3): the pack draws
	 * it from the population at a seed and size, so a book campaign or a
	 * Books tab needs only the numbers.
	 */
	book?: (request: BookRequest) => Book;
	/**
	 * The work-item kinds this workflow takes (WP84, `75-THE-MONITOR.md` §5):
	 * what a desk running it is offered by the clock. A host that assigns
	 * desks by workflow reads it; a workflow without one is assumed to take
	 * applications, the loan book's kind.
	 */
	kinds?: WorkItemKind[];
}

export interface BookRequest {
	seed: number;
	size: number;
	periodDays?: number;
	/** The pack's own filter shape, passed through. */
	filter?: unknown;
	/** The corpus a book is drawn from (WP119, `105-…` §7): one item per row, the row's labels as the truth. */
	corpus?: Corpus;
	/** The knobs the book's verdicts are judged under; the defaults without. */
	knobs?: Record<string, number | string | boolean>;
}
