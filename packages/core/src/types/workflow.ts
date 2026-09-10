import type { ActionCall, WorldState } from './world.js';
import type { JsonSchema } from './json-schema.js';
import type { Book, WorkItem } from '../schemas/book.js';

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
	  };

export interface StageSpec<In = unknown, Out = unknown> {
	id: string;
	name: string;
	input: JsonSchema;
	output: JsonSchema;
	/** The default; a `WorkflowConfig.executors[id]` overrides it. */
	executor: Executor;
	/** What runs at this stage's boundary in addition to the bot's own. */
	guards?: { policyCards?: string[] };
	/** The stage commits something — disburse, freeze, file a SAR. */
	irreversible?: boolean;
	/**
	 * What a scripted person answers at a `human` stage (WP80): the
	 * recommendation on the desk — the bot's, or the rule's verdict — so a
	 * campaign's person follows the case rather than the first option.
	 */
	suggest?: (input: In, state: WorldState, truth: unknown) => string | undefined;
	/** The stage's output read off the world once an agent or a line has done its work; a rule returns its own. */
	read?: (state: WorldState, truth: unknown) => Out | undefined;
	/** Which stage follows, or `'end'` — from this stage's output, the state and, when it matters, the input it was given. */
	next: (out: Out, state: WorldState, input: In) => string | 'end';
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
	/** The thought experiment's level this configuration is, and the decision-rights ceilings it is measured against (WP80). */
	autonomy?: { level: AutonomyLevel; ceilings?: Record<string, AutonomyLevel> };
	/** WP81's `ContextSpec`; carried untyped until it lands. */
	context?: unknown;
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
}

export interface BookRequest {
	seed: number;
	size: number;
	periodDays?: number;
	/** The pack's own filter shape, passed through. */
	filter?: unknown;
	/** The knobs the book's verdicts are judged under; the defaults without. */
	knobs?: Record<string, number | string | boolean>;
}
