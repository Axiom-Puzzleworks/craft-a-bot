import type {
	Book,
	EgressMode,
	EventBus,
	Guardrail,
	PackManifest,
	PackRegistry,
	Principal,
	StoredCampaignReport,
	Unsubscribe,
	WorkItem,
	WorkflowConfig,
	WorkflowSpec
} from '@craftabot/core';
import { bookSchema, contextSpecSchema, type ContextSpec } from '@craftabot/core';
import { compilePolicyCard } from '@craftabot/governance';
import { runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { createSessionGroup, injectionSchema, toSpecV2 } from '@craftabot/core';
import { createGroupWatchbot, createEvaluatorCircuitBreaker } from '@craftabot/pack-monitor';
import { counterpartScriptFor, counterpartSpec, deskFor } from './counterpart-seat.js';
import starterPack from '@craftabot/pack-starter';
import { z } from 'zod';
import {
	assertionCardSchema,
	fittedBrickSchema,
	kitFileSchema,
	migrateAgentSpec,
	runOutcomeSchema,
	type AgentSpecV2,
	createPackRegistry,
	type ConfusionLabelSemantics,
	type EngineEvent,
	type Evaluator,
	type FittedBrick,
	type LLMProvider,
	type RunOutcome
} from '@craftabot/core';
import {
	buildSpec,
	runToCompletion,
	type Plan,
	type SpecOverrides
} from '@craftabot/pack-starter/testing';
import { evaluateAssertion } from './assertions.js';
import { evaluationInputFor, inputReadableBy, resolveEvaluator } from './evaluators.js';
import { createMockProvider, createTestClock, type MockScript } from '@craftabot/core/testing';
import { injectedWorld, registryForScenario } from './scenarios.js';
import { splitInjections } from '@craftabot/core';
import {
	DEFAULT_NOISE,
	scriptedAdversary,
	scriptedNoisy,
	scriptedOptimal,
	type NoiseRates
} from './brains.js';
import { scoreRun } from './metrics.js';
import {
	campaignSummarySchema,
	DERIVED_NAMES,
	derivedOf,
	summariseCampaign,
	type DerivedName
} from './campaign-summary.js';
import { starterPlans, type PlanSource } from './plans.js';
import { evalTierSchema, runMetricsSchema, type EvalTier } from './report.js';

/**
 * **Campaigns** (WP38, `28-CAMPAIGNS.md`): `MatrixSpec` grown two axes — the
 * *scenario* (a card and the bricks it needs, adversarial ones included) and
 * the *guard* (the defence fitted against it) — and given *gates*, rules over
 * the resulting cells that pass or fail. A campaign is a file; running one
 * produces a report that is a file; a pipeline can fail on the report.
 *
 * Deliberately narrow where the target design (`26-…` §6.9) names contracts
 * that do not exist yet: gates are over outcomes, metrics and the assertion
 * cards the campaign carries inline (evaluators are WP43); a scenario is a
 * goal card plus fitted bricks (the scenario contract is WP44). Where a field
 * cannot be honoured today it is absent, not present and ignored.
 */

export const CAMPAIGN_SCHEMA_VERSION = 1;
/** v2 (WP61, `50-DOMAIN-METRICS.md` §4.5): labels, case metrics and the cohort on a cell, the summary on the report. v1 reads as before. */
export const CAMPAIGN_REPORT_SCHEMA_VERSION = 2;

const memoryOverrideSchema = z.object({
	windowSize: z.union([z.literal(3), z.literal(10), z.literal(30)]),
	notebook: z.boolean(),
	strategy: z.enum(['window', 'transcript']).optional()
});
const safetyOverrideSchema = z.object({
	maxTicks: z.number().int().positive(),
	blockedActions: z.array(z.string()),
	approvalMode: z.boolean(),
	repeatLimit: z.number().int().optional(),
	policyCards: z.array(z.string()).optional()
});

/** `SpecOverrides` from the starter pack's harness, as data — minus the card and tools a scenario decides. */
export const specOverridesSchema = z.object({
	id: z.string().optional(),
	name: z.string().optional(),
	senses: z.array(z.string()).optional(),
	actions: z.array(z.string()).optional(),
	memory: memoryOverrideSchema.nullable().optional(),
	safety: safetyOverrideSchema.nullable().optional(),
	llm: z.boolean().optional(),
	temperature: z.number().optional(),
	maxTokens: z.number().int().optional(),
	personality: z.string().optional(),
	/**
	 * The world's knobs (WP78, `64-…` §6.6.2): handed to the world at `create`
	 * as `config.knobs`, so a desk's policy — the lending thresholds — is a
	 * build axis, and a sweep over one knob is one campaign. Not a spec
	 * override at all; stripped before the spec is built.
	 */
	knobs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
	/** The workflow's named configuration this build runs, in a book campaign (WP80, `73-…` §4): an autonomy level applied to the journey. Not a spec override either. */
	configuration: z.string().min(1).optional()
});

export const noiseRatesSchema = z.object({
	misname: z.number().min(0).max(1),
	wastedMove: z.number().min(0).max(1),
	prematureCelebrate: z.number().min(0).max(1)
});

export const runMetricNameSchema = z.enum([
	'ticksUsed',
	'tokensIn',
	'tokensOut',
	'wastedTickRatio',
	'loop.longestStreak',
	'loop.repeatedFailures',
	'namingMisses',
	'namingAmbiguities',
	'approvalsRequested',
	'approvalsDenied',
	'guardrailTrips'
]);
export type RunMetricName = z.infer<typeof runMetricNameSchema>;

/**
 * A metric a gate may name (WP61, `50-…` §4.4): a run metric, a world's
 * per-case metric (`case:<id>`, over `caseMetrics`, cells with none left
 * out), or a derived rate of a labelled evaluator
 * (`evaluator:<id>:precision|recall|f1|falsePositiveRate`, folded over the
 * selected cells as a set). A pattern, not an enum edit.
 */
export const CASE_METRIC_PATTERN = /^case:[A-Za-z0-9_.-]+$/;
export const DERIVED_METRIC_PATTERN = /^evaluator:(.+):(precision|recall|f1|falsePositiveRate)$/;
export const metricNameSchema = z.union([
	runMetricNameSchema,
	z.string().regex(CASE_METRIC_PATTERN),
	z.string().regex(DERIVED_METRIC_PATTERN)
]);
export type MetricName = z.infer<typeof metricNameSchema>;

const rateBounds = {
	atLeast: z.number().min(0).max(1).optional(),
	atMost: z.number().min(0).max(1).optional()
};

export const gateWhereSchema = z.object({
	scenario: z.string().optional(),
	tag: z.string().optional(),
	build: z.string().optional(),
	guard: z.string().optional(),
	brain: z.string().optional(),
	/** The context rung's id (WP81). */
	context: z.string().optional(),
	/** `<attribute>=<value>`, matched against the cell's cohort read from truth (WP61). */
	cohort: z
		.string()
		.regex(/^[^=]+=.+$/)
		.optional()
});
export type GateWhere = z.infer<typeof gateWhereSchema>;

export const derivedNameSchema = z.enum(DERIVED_NAMES);

export const gateRequireSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('outcome-rate'), outcome: runOutcomeSchema, ...rateBounds }),
	z.object({ kind: z.literal('assertion-pass-rate'), cardId: z.string().min(1), ...rateBounds }),
	/** WP43 (`31-EVALUATORS.md` §4.2): `pass` over the cells whose verdict is not `inconclusive`. */
	z.object({
		kind: z.literal('evaluator-pass-rate'),
		evaluatorId: z.string().min(1),
		...rateBounds
	}),
	z.object({
		kind: z.literal('metric'),
		name: metricNameSchema,
		aggregate: z.enum(['mean', 'median', 'max']).default('mean'),
		atMost: z.number().optional(),
		atLeast: z.number().optional()
	}),
	z.object({ kind: z.literal('no-regression'), tolerance: z.number().min(0).max(1).default(0) }),
	// WP61 (`50-…` §4.4): over a labelled evaluator's matrix, over one label's share, and across a cohort.
	z.object({
		kind: z.literal('derived-metric'),
		evaluatorId: z.string().min(1),
		derived: derivedNameSchema,
		...rateBounds
	}),
	z.object({
		kind: z.literal('label-rate'),
		evaluatorId: z.string().min(1),
		label: z.string().min(1),
		...rateBounds
	}),
	z.object({
		kind: z.literal('parity'),
		/** The cohort attribute to compare across. */
		across: z.string().min(1),
		of: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('outcome-rate'), outcome: runOutcomeSchema }),
			z.object({ kind: z.literal('evaluator-pass-rate'), evaluatorId: z.string().min(1) }),
			z.object({
				kind: z.literal('label-rate'),
				evaluatorId: z.string().min(1),
				label: z.string().min(1)
			}),
			z.object({
				kind: z.literal('derived-metric'),
				evaluatorId: z.string().min(1),
				derived: derivedNameSchema
			}),
			z.object({
				kind: z.literal('metric'),
				name: metricNameSchema,
				aggregate: z.enum(['mean', 'median', 'max']).default('mean')
			})
		]),
		/** Fails when the largest value minus the smallest exceeds this. */
		maxDifference: z.number().min(0).optional(),
		/** Fails when the smallest over the largest is below this — `0.8` is the four-fifths rule. */
		minRatio: z.number().min(0).max(1).optional(),
		/** The campaign's own claim that its cohorts are matched pairs; the verdict repeats it. Default false. */
		matched: z.boolean().default(false)
	})
]);
export type GateRequire = z.infer<typeof gateRequireSchema>;

export const gateSchema = z.object({
	id: z.string().min(1),
	where: gateWhereSchema.optional(),
	require: gateRequireSchema
});
export type Gate = z.infer<typeof gateSchema>;

export const campaignScenarioSchema = z
	.object({
		id: z.string().min(1),
		/** The card, named directly — or inherited from `scenarioId` (WP44). */
		goalCardId: z.string().min(1).optional(),
		/** A registered scenario (`32-SCENARIOS.md` §4.6): its card, tags and injections come with it. */
		scenarioId: z.string().min(1).optional(),
		tags: z.array(z.string()).default([]),
		/** Injections beside the scenario's own, applied to every cell's world. */
		injections: z.array(injectionSchema).default([]),
		fit: z.array(fittedBrickSchema).default([]),
		maxTicks: z.number().int().positive().optional()
	})
	.refine((scenario) => scenario.goalCardId !== undefined || scenario.scenarioId !== undefined, {
		message: 'a campaign scenario names a goalCardId or a scenarioId'
	});
export type CampaignScenario = z.infer<typeof campaignScenarioSchema>;

export const campaignBuildSchema = z.object({
	id: z.string().min(1),
	base: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('starter-default') }),
		z.object({ kind: z.literal('kit'), kit: kitFileSchema })
	]),
	overrides: specOverridesSchema.optional()
});
export type CampaignBuild = z.infer<typeof campaignBuildSchema>;

/**
 * The group-level half of a named stack (WP64, `56-…` §4.2): what a
 * two-seat cell installs at the episode's chokepoint beside the bricks —
 * the group Watchbot's rules, its breaker on refusals, and a breaker on an
 * evaluator's verdict (the Compliance Watchbot's `unsuitable`,
 * `tipped-off`). A single-seat cell has no chokepoint and ignores it.
 */
export const campaignGuardGroupSchema = z.object({
	watchFor: z.array(z.string().min(1)).default([]),
	refusalLimit: z.number().int().positive().optional(),
	breakOn: z
		.array(
			z
				.object({
					evaluatorId: z.string().min(1),
					/** Stop when the evaluator's label is one of these. */
					labels: z.array(z.string().min(1)).default([]),
					/** Stop when the evaluator fails — for a verdict with no label, or one whose label needs truth the chokepoint never sees. */
					onFail: z.boolean().default(false)
				})
				.refine((entry) => entry.labels.length > 0 || entry.onFail, {
					message: 'a breakOn entry names labels, or onFail, or both'
				})
		)
		.default([])
});
export type CampaignGuardGroup = z.infer<typeof campaignGuardGroupSchema>;

export const campaignGuardSchema = z.object({
	id: z.string().min(1),
	fit: z.array(fittedBrickSchema).default([]),
	for: z.array(z.string()).optional(),
	group: campaignGuardGroupSchema.optional()
});

/**
 * Which instrument a campaign is (WP64, `56-…` §4.2): `scripted` — the
 * desk's own interpreter in the world, deterministic, what CI runs — or
 * `live` — a second seat with a cartridge, under `budget`. One per
 * campaign, because the two are not comparable and a report must not be
 * asked to compare them.
 */
export const campaignCounterpartSchema = z.object({
	tier: z.enum(['scripted', 'live']),
	/** With `live`, the seat's cartridge; the seat takes any installed one. */
	cartridgeId: z.string().min(1).optional(),
	/** With `live`, the round cap of each episode (default 30). */
	maxRounds: z.number().int().positive().optional()
});
export type CampaignCounterpart = z.infer<typeof campaignCounterpartSchema>;
export type CampaignGuard = z.infer<typeof campaignGuardSchema>;

export const campaignBrainSchema = z.object({
	id: z.string().min(1),
	tier: evalTierSchema,
	cartridgeId: z.string().optional()
});
export type CampaignBrain = z.infer<typeof campaignBrainSchema>;

/**
 * **A book as the source of cells** (WP80, `64-…` §6.6.3; `73-…` §4): a
 * campaign whose cells come from a book's work items run through a
 * workflow, rather than from scenarios × seeds — one cell per item × build
 * × guard × brain, the item's truth as the cell's. The book is inline
 * (`book`, a `Book` the page drew) or drawn at run time by the workflow's
 * own `book` from a population at `seed` and `size`. `configuration` is
 * the workflow's named configuration every build runs unless the build
 * names its own (`overrides.configuration`). The campaign's `seeds` seed
 * the seats; the first is used.
 */
export const campaignSourceSchema = z.object({
	kind: z.literal('book'),
	workflowId: z.string().min(1),
	configuration: z.string().min(1).optional(),
	book: bookSchema.optional(),
	population: z
		.object({
			seed: z.number().int(),
			size: z.number().int().positive(),
			periodDays: z.number().int().positive().optional()
		})
		.optional(),
	filter: z.unknown().optional(),
	/** Only the first `limit` items of the book, in its order. */
	limit: z.number().int().positive().optional()
});
export type CampaignSource = z.infer<typeof campaignSourceSchema>;

const campaignObjectSchema = z.object({
	schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
	id: z.string().min(1),
	title: z.string().min(1),
	/** Empty only when `source` names a book (WP80). */
	scenarios: z.array(campaignScenarioSchema),
	/** A book through a workflow as the cells (WP80); absent, the scenarios are. */
	source: campaignSourceSchema.optional(),
	/** The context ladder as an axis (WP81, `70-…` §6): every cell runs once per rung named; absent, the case file as today, and the cells carry no `context`. */
	contexts: z.array(contextSpecSchema).min(1).optional(),
	builds: z.array(campaignBuildSchema).min(1),
	guards: z.array(campaignGuardSchema).min(1),
	brains: z.array(campaignBrainSchema).min(1),
	/** The seat across the desk (WP64): absent means `scripted`, the desk's own interpreter. */
	counterpart: campaignCounterpartSchema.optional(),
	seeds: z.array(z.number().int()).min(1),
	noise: noiseRatesSchema.partial().optional(),
	assertionCards: z.array(assertionCardSchema).default([]),
	/** Sinks every cell's finished trace is exported to (WP47, `35-…` §4.5): by sink id, with the sink's own config. The harness resolves them; the app runs none. */
	sinks: z.array(z.object({ id: z.string().min(1), config: z.unknown().optional() })).default([]),
	/** Evaluators run over every cell (WP43): by registered id, with the evaluator's own config; non-deterministic kinds run offline. */
	evaluators: z
		.array(z.object({ id: z.string().min(1), config: z.unknown().optional() }))
		.default([]),
	gates: z.array(gateSchema).min(1),
	budget: z
		.object({
			maxLiveCells: z.number().int().positive(),
			maxTokens: z.number().int().positive().optional(),
			/** Hosted evaluator calls this campaign may make live (WP51, `39-…` §4.3); unset means as many as its cells ask. */
			maxLiveEvaluations: z.number().int().nonnegative().optional()
		})
		.optional()
});
export const campaignSchema = campaignObjectSchema.superRefine((campaign, context) => {
	if (campaign.scenarios.length === 0 && campaign.source === undefined) {
		context.addIssue({
			code: 'custom',
			path: ['scenarios'],
			message: 'a campaign runs scenarios, or a book through a workflow (source)'
		});
	}
	if (
		campaign.source &&
		campaign.source.book === undefined &&
		campaign.source.population === undefined
	) {
		context.addIssue({
			code: 'custom',
			path: ['source'],
			message: 'a book source carries the book inline, or a population to draw it from'
		});
	}
});
export type Campaign = z.infer<typeof campaignObjectSchema>;

export function parseCampaign(value: unknown): Campaign {
	return campaignSchema.parse(value);
}

export const campaignCellSchema = z.object({
	scenario: z.string(),
	build: z.string(),
	guard: z.string(),
	/** The context rung this cell ran at (WP81); written only when the campaign named contexts. */
	context: z.string().optional(),
	brain: z.string(),
	tier: evalTierSchema,
	seed: z.number().int(),
	/** The scenario's tags, carried so a report can be grouped and gated by them without the campaign. */
	tags: z.array(z.string()).default([]),
	runId: z.string().optional(),
	outcome: runOutcomeSchema.optional(),
	metrics: runMetricsSchema,
	assertions: z.record(z.string(), z.boolean()),
	/** Evaluator verdicts (WP43), keyed by evaluator id. */
	evaluations: z.record(z.string(), z.enum(['pass', 'fail', 'inconclusive'])).default({}),
	/** `EvaluationResult.label` per evaluator that gave one (WP61). */
	labels: z.record(z.string(), z.string()).default({}),
	/** The world's declared per-case metrics, folded over the run (WP61). */
	caseMetrics: z.record(z.string(), z.number()).default({}),
	/** From `run.finished.truth.cohort`, when the world has one (WP61): attribute → value. */
	cohort: z.record(z.string(), z.string()).optional(),
	/** The cell's number in the campaign's own order (WP68, `57-…` §2 item 2): what a merge sorts by. Absent on a report written before, which was whole and in order. */
	ordinal: z.number().int().nonnegative().optional(),
	/** The work item this cell ran, in a book campaign (WP80). */
	item: z.object({ id: z.string(), kind: z.string(), customerId: z.string() }).optional(),
	/** The workflow run's account of itself (WP80, `73-…` §4): the stage statuses, the touches a person made, the decisions with the level they were taken at and how many sat above their ceiling. */
	workflow: z
		.object({
			runId: z.string(),
			configuration: z.string().optional(),
			autonomy: z.number().int().min(1).max(5).optional(),
			outcome: z.enum(['completed', 'stopped', 'abandoned']),
			stages: z.array(
				z.object({
					stageId: z.string(),
					executor: z.enum(['rule', 'agent', 'human', 'line']),
					status: z.enum(['ok', 'blocked', 'escalated', 'error'])
				})
			),
			touches: z.array(z.string()),
			decisions: z.array(z.object({ kind: z.string(), level: z.number().int().min(1).max(5) })),
			breaches: z.number().int().nonnegative()
		})
		.optional(),
	/** The seat across the desk in this cell (WP64): the tier, and for a live seat who sat there. Defaulted so every stored report parses. */
	counterpart: z
		.object({
			tier: z.enum(['scripted', 'live']),
			name: z.string().optional(),
			cartridgeId: z.string().optional(),
			/** The seat's own run, when it had one. */
			runId: z.string().optional()
		})
		.optional(),
	error: z.string().optional()
});
export type CampaignCell = z.infer<typeof campaignCellSchema>;

export const gateVerdictSchema = z.object({
	id: z.string(),
	kind: z.string(),
	where: gateWhereSchema.optional(),
	required: z.string(),
	observed: z.number().optional(),
	cells: z.number().int().nonnegative(),
	passed: z.boolean(),
	inconclusive: z.literal(true).optional(),
	/** A `parity` verdict (WP61): the campaign's claim that the cohorts were matched, and the number in each value. */
	matched: z.boolean().optional(),
	values: z.record(z.string(), z.number()).optional()
});
export type GateVerdict = z.infer<typeof gateVerdictSchema>;

export const campaignReportSchema = z.object({
	/** 2 since WP61; a v1 report parses and is upgraded on read (`parseCampaignReport`). */
	schemaVersion: z.union([z.literal(1), z.literal(2)]),
	id: z.string(),
	campaignId: z.string(),
	campaignTitle: z.string(),
	createdAt: z.string(),
	packVersions: z.record(z.string(), z.string()),
	noise: noiseRatesSchema,
	/**
	 * Which bot each build was (WP49, `37-…` §4.2): a build made from a kit
	 * file carries that kit's agent id and name, so a stored report can be
	 * held against a shelf bot's safety case; a `starter-default` build is
	 * nobody's. Defaulted, so every report written before the field parses.
	 */
	builds: z
		.array(
			z.object({
				id: z.string(),
				agentId: z.string().optional(),
				agentName: z.string().optional(),
				/** The world's knobs this build ran with (WP78), so a slice by build reads as a slice by knob. */
				knobs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
				/** The workflow configuration this build ran (WP80), so a slice by build reads as a slice by autonomy level. */
				configuration: z.string().optional()
			})
		)
		.default([]),
	cells: z.array(campaignCellSchema),
	gates: z.array(gateVerdictSchema),
	passed: z.boolean(),
	/** Which instrument this report is (WP64, `56-…` §4.2); absent on a report written before, which is a scripted one. */
	counterpart: campaignCounterpartSchema.optional(),
	/** A slice of the campaign (WP68, `57-…` §4.2): the `index`-th of `of`, its gates over its own cells; `craftabot merge` folds slices back. */
	shard: z
		.object({ index: z.number().int().positive(), of: z.number().int().positive() })
		.optional(),
	/** The readers' numbers (WP61, `50-…` §4.5), folded once from the cells; a v1 report gets it on read. */
	summary: campaignSummarySchema.optional(),
	budget: z.object({
		liveCells: z.number().int().nonnegative(),
		tokensIn: z.number().int().nonnegative(),
		tokensOut: z.number().int().nonnegative(),
		/** Hosted evaluator calls actually made live (WP51); defaulted so older reports parse. */
		liveEvaluations: z.number().int().nonnegative().default(0)
	})
});
export type CampaignReport = z.infer<typeof campaignReportSchema>;

/**
 * A report, v1 or v2. A v1 report keeps its `schemaVersion: 1` (so a
 * `no-regression` gate against it says so) and gains a `summary` folded
 * from its cells — with no matrices, since it never recorded what its
 * labels meant; a v2 report's stored matrices supply the semantics.
 */
export function parseCampaignReport(value: unknown): CampaignReport {
	const parsed = campaignReportSchema.parse(value);
	if (parsed.summary) return parsed;
	return { ...parsed, summary: summariseCampaign(parsed.cells) };
}

/** What a stored report's matrices say each labelled evaluator's labels mean — the semantics travel with the report. */
export function semanticsFromReport(
	report: Pick<CampaignReport, 'summary'>
): (evaluatorId: string) => ConfusionLabelSemantics | undefined {
	return (evaluatorId) =>
		report.summary?.matrices.find((matrix) => matrix.evaluatorId === evaluatorId)?.semantics;
}

/**
 * The envelope a store keeps a report in (`StoredCampaignReport`, `28-…`
 * §4.9): the fields a list shows without opening the report, and the report
 * itself as opaque JSON. Here rather than in the app since WP49, so the
 * harness files a report the same way the Workshop does and `craftabot
 * report --safety-case` can quote it.
 */
export function campaignEnvelope(report: CampaignReport): StoredCampaignReport {
	return {
		id: report.id,
		campaignId: report.campaignId,
		title: report.campaignTitle,
		createdAt: report.createdAt,
		passed: report.passed,
		gatesPassed: report.gates.filter((gate) => gate.passed).length,
		gatesTotal: report.gates.length,
		cells: report.cells.length,
		report: report as unknown as Record<string, unknown>,
		schemaVersion: 1
	};
}

/** One cell, before it runs: the point in the campaign's five axes — or, in a book campaign (WP80), the work item at the point in four. */
export interface CampaignCellSpec {
	scenario: CampaignScenario;
	build: CampaignBuild;
	guard: CampaignGuard;
	brain: CampaignBrain;
	seed: number;
	ordinal: number;
	item?: WorkItem;
	/** The rung of the context ladder (WP81); absent when the campaign named none. */
	context?: ContextSpec;
}

/** The synthetic scenario a book campaign's cells sit in: the workflow's id, its obligations as the tags, no card of its own. */
export function bookScenario(campaign: Campaign, workflow?: WorkflowSpec): CampaignScenario {
	const workflowId = campaign.source?.workflowId ?? 'book';
	return {
		id: workflowId,
		goalCardId: workflowId,
		tags: [...(workflow?.obligations ?? [])],
		injections: [],
		fit: []
	};
}

/** The items a book campaign runs: the inline book's, or the drawn one's, under `limit`. */
export function bookItems(campaign: Campaign, book: Book | undefined): WorkItem[] {
	const source = campaign.source;
	if (!source) return [];
	const items = (book ?? source.book)?.items ?? [];
	return source.limit !== undefined ? items.slice(0, source.limit) : items;
}

/**
 * Every cell a campaign will run, in the order it will run them —
 * scenarios × builds × guards(applicable) × brains × seeds; in a book
 * campaign, items × builds × guards × brains, the first seed seeding the
 * seats (WP80). A book source with no book in hand (drawn at run time from
 * a population) counts no cells until it is prepared.
 */
export function campaignCells(
	campaign: Campaign,
	book?: Book,
	workflow?: WorkflowSpec
): CampaignCellSpec[] {
	const cells: CampaignCellSpec[] = [];
	if (campaign.source) {
		const scenario = bookScenario(campaign, workflow);
		const seed = campaign.seeds[0] ?? 1;
		for (const item of bookItems(campaign, book)) {
			for (const build of campaign.builds) {
				for (const guard of campaign.guards) {
					if (guard.for !== undefined && !guard.for.includes(scenario.id)) continue;
					for (const brain of campaign.brains) {
						for (const context of campaign.contexts ?? [undefined]) {
							cells.push({
								scenario,
								build,
								guard,
								brain,
								seed,
								ordinal: cells.length,
								item,
								...(context ? { context: context as ContextSpec } : {})
							});
						}
					}
				}
			}
		}
		return cells;
	}
	for (const scenario of campaign.scenarios) {
		for (const build of campaign.builds) {
			for (const guard of campaign.guards) {
				if (guard.for !== undefined && !guard.for.includes(scenario.id)) continue;
				for (const brain of campaign.brains) {
					for (const context of campaign.contexts ?? [undefined]) {
						for (const seed of campaign.seeds) {
							cells.push({
								scenario,
								build,
								guard,
								brain,
								seed,
								ordinal: cells.length,
								...(context ? { context: context as ContextSpec } : {})
							});
						}
					}
				}
			}
		}
	}
	return cells;
}

export interface RunCampaignOptions {
	/** Where a `live` cell's provider comes from; a live cell with none is recorded as an error, never faked. */
	providerFor?: (brain: CampaignBrain) => LLMProvider;
	/** The previous report, for `no-regression` gates; without one they are inconclusive. */
	baseline?: CampaignReport;
	packVersions?: Record<string, string>;
	now?: () => string;
	newId?: () => string;
	onCell?: (cell: CampaignCell, index: number, total: number) => void;
	onTrace?: (
		cell: CampaignCell,
		trace: { events: readonly EngineEvent[]; spec: AgentSpecV2 }
	) => void;
	betweenCells?: () => Promise<void>;
	/** Every cell's session egress mode (WP41, `26-…` §6.6); the CI baseline runs `'none'`. */
	egress?: EgressMode;
	/** Every cell's principal (WP65, `55-…` §4.2): the host running the campaign, on each cell's `run.started`. */
	principal?: Principal;
	/** Packs registered beside the starter pack for every cell (WP42): a guard that stacks a Guard Brick needs the workshop pack and the service's own. */
	packs?: PackManifest[];
	/** Where a scripted cell's plan comes from (WP60, `49-…` §4.7): the host composes its packs' `/testing` plans; the starter pack's by default. */
	plans?: PlanSource;
	/**
	 * A hosted evaluator's battery (WP51, `39-…` §4.3): with a credential, a
	 * `budget` on the campaign and a config on the evaluator, it runs live;
	 * without any of the three, offline. The app passes none.
	 */
	credentials?: (id: string) => string | undefined;
	/** The `fetch` a live hosted evaluator uses; `globalThis.fetch` when unset. */
	fetch?: typeof globalThis.fetch;
	/**
	 * **The seam** (WP68, `57-HARNESS-AT-SCALE.md` §4.1): a host that wants
	 * to run a cell elsewhere — a worker, another process — supplies this and
	 * the runner still owns the cells, the budget, the gates and the report,
	 * placing each result by its ordinal so the report reads the same
	 * whatever the scheduling. Absent, the runner runs the cell itself.
	 */
	execute?: (cell: CampaignCellSpec, run: () => Promise<CellResult>) => Promise<CellResult>;
	/** How many cells are in flight at once through `execute`; 1 by default. */
	concurrency?: number;
	/** Run only the `index`-th of `of` slices of the cells (1-based); the report says so. */
	shard?: { index: number; of: number };
}

/** What running one cell yields (WP68): the scored cell, its trace when the host wants to keep it, and what it spent beyond tokens. */
export interface CellResult {
	cell: CampaignCell;
	trace?: { events: EngineEvent[]; spec: AgentSpecV2 };
	liveEvaluations?: number;
}

/** A campaign made ready to run (WP68): the resolved campaign, its cells, the registry and the noise — what a cell needs, wherever it runs. */
export interface PreparedCampaign {
	campaign: Campaign;
	cells: CampaignCellSpec[];
	registry: PackRegistry;
	noise: NoiseRates;
	/** The book a book campaign runs (WP80): inline, or drawn here by the workflow from the population named. */
	book?: Book;
}

/** The same stride the matrix uses (`runner.ts`), for the same reason: a cell's ids depend only on its position. */
const ID_STRIDE = 100_000;

/**
 * A campaign with every `scenarioId` resolved against the registry (WP44,
 * `32-…` §4.6): the card comes from the scenario unless named, the tags are
 * the union, the injections are the scenario's followed by the campaign's.
 */
export function resolveCampaign(campaign: Campaign, registry: PackRegistry): Campaign {
	return {
		...campaign,
		scenarios: campaign.scenarios.map((scenario) => {
			if (scenario.scenarioId === undefined) return scenario;
			const definition = registry.getScenario(scenario.scenarioId);
			if (!definition) {
				throw new Error(
					`campaign scenario "${scenario.id}" names scenario "${scenario.scenarioId}", which no pack ships`
				);
			}
			return {
				...scenario,
				goalCardId: scenario.goalCardId ?? definition.goalCardId,
				tags: [...new Set([...definition.tags, ...scenario.tags])],
				injections: [...definition.injections, ...scenario.injections]
			};
		})
	};
}

function goalCardOf(scenario: CampaignScenario): string {
	if (scenario.goalCardId === undefined) {
		throw new Error(
			`campaign scenario "${scenario.id}" has no goal card — resolve its scenarioId first`
		);
	}
	return scenario.goalCardId;
}

/** The campaign made ready (WP68, `57-…` §4.1): resolved against a registry built from the host's packs, its cells enumerated. */
export function prepareCampaign(
	unresolved: Campaign,
	options: Pick<RunCampaignOptions, 'packs'> = {}
): PreparedCampaign {
	const registry = registryForScenario(options.packs);
	const campaign = resolveCampaign(unresolved, registry);
	if (campaign.source) {
		const workflow = workflowOf(registry, campaign.source);
		const book = drawBook(campaign.source, workflow);
		return {
			campaign,
			cells: campaignCells(campaign, book, workflow),
			registry,
			noise: noiseFor(campaign.noise),
			book
		};
	}
	return { campaign, cells: campaignCells(campaign), registry, noise: noiseFor(campaign.noise) };
}

function workflowOf(registry: PackRegistry, source: CampaignSource): WorkflowSpec {
	const workflow = registry.getWorkflow(source.workflowId);
	if (!workflow) {
		const known = registry.listWorkflows().map((entry) => entry.id);
		throw new Error(
			`campaign source names workflow "${source.workflowId}", which no pack ships${known.length > 0 ? ` (installed: ${known.join(', ')})` : ''}`
		);
	}
	return workflow;
}

/** The book in hand, or the one the workflow draws from the population named — the same bytes at the same seed and size wherever it is drawn. */
function drawBook(source: CampaignSource, workflow: WorkflowSpec): Book {
	if (source.book) return source.book;
	const population = source.population;
	if (!population)
		throw new Error('a book source carries the book inline, or a population to draw it from');
	if (!workflow.book) {
		throw new Error(
			`workflow "${workflow.id}" draws no book of its own; hand the campaign one inline`
		);
	}
	return workflow.book({
		seed: population.seed,
		size: population.size,
		...(population.periodDays !== undefined ? { periodDays: population.periodDays } : {}),
		...(source.filter !== undefined ? { filter: source.filter } : {})
	});
}

/**
 * One cell, run exactly as the runner runs it (WP68): what a host's worker
 * calls. The trace is returned rather than handed to `onTrace`, so the
 * caller — this process or another — decides who keeps it.
 */
export async function runCampaignCell(
	spec: CampaignCellSpec,
	prepared: PreparedCampaign,
	options: RunCampaignOptions = {}
): Promise<CellResult> {
	const tally: SpendTally = { liveEvaluations: 0 };
	let trace: CellResult['trace'];
	const cell = await runCell(
		spec,
		prepared.campaign,
		prepared.noise,
		{
			...options,
			onTrace: (_cell, captured) => {
				trace = { events: [...captured.events], spec: captured.spec };
			}
		},
		prepared.registry,
		tally
	);
	return { cell, ...(trace ? { trace } : {}), liveEvaluations: tally.liveEvaluations };
}

/** The cells of the `index`-th of `of` slices (WP68, `57-…` §4.2): by ordinal, so every slice is deterministic and they tile the whole. */
export function shardCells(
	cells: readonly CampaignCellSpec[],
	shard: { index: number; of: number }
): CampaignCellSpec[] {
	if (shard.of < 1 || shard.index < 1 || shard.index > shard.of) {
		throw new Error(`--shard wants i/n with 1 ≤ i ≤ n, got ${shard.index}/${shard.of}`);
	}
	return cells.filter((cell) => cell.ordinal % shard.of === shard.index - 1);
}

export async function runCampaign(
	unresolved: Campaign,
	options: RunCampaignOptions = {}
): Promise<CampaignReport> {
	const prepared = prepareCampaign(unresolved, options);
	const { campaign, registry, noise } = prepared;
	const allCells = prepared.cells;
	guardBudget(campaign, allCells);
	const cells = options.shard ? shardCells(allCells, options.shard) : allCells;

	const tally: SpendTally = { liveEvaluations: 0 };
	guardLiveEvaluations(campaign, allCells.length, options, registry);
	const runHere = (spec: CampaignCellSpec) => runCampaignCell(spec, prepared, options);
	const execute = options.execute ?? runHere;
	// Placed by ordinal, whatever the scheduling (`57-…` §3): the report reads the same however it was made.
	const placed = new Map<number, CampaignCell>();
	let done = 0;
	let next = 0;
	const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
	async function lane(): Promise<void> {
		while (next < cells.length) {
			const spec = cells[next++] as CampaignCellSpec;
			const result = await execute(spec, () => runHere(spec));
			placed.set(spec.ordinal, result.cell);
			tally.liveEvaluations += result.liveEvaluations ?? 0;
			if (result.trace) options.onTrace?.(result.cell, result.trace);
			done += 1;
			options.onCell?.(result.cell, done, cells.length);
			if (options.betweenCells) await options.betweenCells();
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, cells.length) }, () => lane()));
	const results = cells.map((spec) => placed.get(spec.ordinal) as CampaignCell);

	const semantics = (evaluatorId: string): ConfusionLabelSemantics | undefined => {
		const found = resolveEvaluator(registry, evaluatorId)?.labelSemantics;
		return found?.kind === 'confusion' ? found : undefined;
	};
	const gates = campaign.gates.map((gate) =>
		evaluateGate(gate, results, options.baseline, {
			semantics,
			counterpart: campaign.counterpart ?? { tier: 'scripted' }
		})
	);
	return {
		schemaVersion: CAMPAIGN_REPORT_SCHEMA_VERSION,
		id: options.newId?.() ?? crypto.randomUUID(),
		campaignId: campaign.id,
		campaignTitle: campaign.title,
		createdAt: options.now?.() ?? new Date().toISOString(),
		packVersions: options.packVersions ?? {},
		noise,
		builds: campaign.builds.map((build) => ({
			id: build.id,
			...(build.base.kind === 'kit'
				? { agentId: build.base.kit.agent.id, agentName: build.base.kit.agent.name }
				: {}),
			...(build.overrides?.knobs ? { knobs: build.overrides.knobs } : {}),
			...(build.overrides?.configuration !== undefined
				? { configuration: build.overrides.configuration }
				: campaign.source?.configuration !== undefined
					? { configuration: campaign.source.configuration }
					: {})
		})),
		cells: results,
		gates,
		passed: gates.every((gate) => gate.passed),
		counterpart: campaign.counterpart ?? { tier: 'scripted' },
		...(options.shard ? { shard: { ...options.shard } } : {}),
		summary: summariseCampaign(results, { semantics }),
		budget: {
			// A live seat is a live cell whatever the agent's brain (WP64).
			liveCells: results.filter((cell) => cell.tier === 'live' || cell.counterpart?.tier === 'live')
				.length,
			tokensIn: results.reduce((total, cell) => total + cell.metrics.tokensIn, 0),
			tokensOut: results.reduce((total, cell) => total + cell.metrics.tokensOut, 0),
			liveEvaluations: tally.liveEvaluations
		}
	};
}

/** What the run spends beyond its cells' tokens — counted as it goes, reported at the end. */
interface SpendTally {
	liveEvaluations: number;
}

/** A parsed `partial()` carries `| undefined` values `NoiseRates` does not admit — drop them before defaulting. */
function noiseFor(overrides: Campaign['noise']): NoiseRates {
	const defined = Object.fromEntries(
		Object.entries(overrides ?? {}).filter(([, value]) => value !== undefined)
	) as Partial<NoiseRates>;
	return { ...DEFAULT_NOISE, ...defined };
}

/**
 * Live spend is a property of the artefact (`27-…` §1 rule 6): a campaign
 * with a live brain and no `budget` refuses before anything runs, naming the
 * field, and `maxLiveCells` is enforced against the cell count before the
 * first call — never discovered by the bill.
 */
/**
 * Whether a named evaluator would call out from this campaign (WP51, `39-…`
 * §4.3): hosted, with a battery from the caller, a config of its own, a
 * `budget` on the campaign, and a network to use. Anything less runs its
 * offline stand-in — as every non-deterministic evaluator did before.
 */
function runsLive(
	campaign: Campaign,
	named: Campaign['evaluators'][number],
	evaluator: Evaluator,
	options: RunCampaignOptions
): boolean {
	if (evaluator.kind !== 'hosted' || !campaign.budget || options.egress === 'none') return false;
	const credentialId = evaluator.credential?.id;
	if (credentialId === undefined || options.credentials?.(credentialId) === undefined) return false;
	return named.config !== undefined;
}

/** Live evaluations are spend too: `maxLiveEvaluations`, when set, is enforced before the first cell. */
function guardLiveEvaluations(
	campaign: Campaign,
	cellCount: number,
	options: RunCampaignOptions,
	registry: PackRegistry
): void {
	const cap = campaign.budget?.maxLiveEvaluations;
	if (cap === undefined) return;
	const liveEvaluators = campaign.evaluators.filter((named) => {
		const evaluator = resolveEvaluator(registry, named.id);
		return evaluator !== undefined && runsLive(campaign, named, evaluator, options);
	}).length;
	const wanted = liveEvaluators * cellCount;
	if (wanted > cap) {
		throw new Error(
			`campaign '${campaign.id}' would make ${wanted} live evaluation calls but its budget allows ${cap} (budget.maxLiveEvaluations)`
		);
	}
}

function guardBudget(campaign: Campaign, cells: CampaignCellSpec[]): void {
	// A live seat makes every cell live (WP64, `56-…` §3), whatever the agent's brain.
	const liveSeat = campaign.counterpart?.tier === 'live';
	if (liveSeat && campaign.counterpart?.cartridgeId === undefined) {
		throw new Error(
			`campaign '${campaign.id}' seats a live counterpart and names no cartridgeId for it`
		);
	}
	const live = cells.filter((cell) => cell.brain.tier === 'live' || liveSeat).length;
	if (live === 0) return;
	if (!campaign.budget) {
		throw new Error(
			`campaign '${campaign.id}' has ${live} live cell${live === 1 ? '' : 's'} and no budget — add "budget": { "maxLiveCells": N } to run them, or drop the live ${liveSeat ? 'counterpart' : 'brain'}`
		);
	}
	if (live > campaign.budget.maxLiveCells) {
		throw new Error(
			`campaign '${campaign.id}' would run ${live} live cells but its budget allows ${campaign.budget.maxLiveCells} (budget.maxLiveCells)`
		);
	}
}

async function runCell(
	cell: CampaignCellSpec,
	campaign: Campaign,
	noise: NoiseRates,
	options: RunCampaignOptions,
	registry: PackRegistry,
	tally: SpendTally
): Promise<CampaignCell> {
	const { scenario, build, guard, brain, seed } = cell;
	const identity = {
		scenario: scenario.id,
		build: build.id,
		guard: guard.id,
		brain: brain.id,
		tier: brain.tier,
		seed,
		tags: scenario.tags,
		...(cell.context ? { context: cell.context.id } : {}),
		ordinal: cell.ordinal
	};
	const empty = () => Object.fromEntries(campaign.assertionCards.map((card) => [card.id, false]));

	try {
		// A work item through a workflow (WP80): the journey, not a session, is the cell.
		if (cell.item && campaign.source) {
			return await runBookCell(
				cell,
				cell.item,
				campaign,
				noise,
				options,
				registry,
				tally,
				identity
			);
		}
		const spec = specFor(cell);
		const goalCardId = goalCardOf(scenario);
		const script = scriptFor(brain.tier, goalCardId, seed, noise, options.plans ?? starterPlans);
		const maxTicks = scenario.maxTicks;
		// A live seat: the cell is a two-seat episode (WP64, `56-…` §4.1), scored on the agent's own events.
		if (campaign.counterpart?.tier === 'live') {
			return await runDuoCell(cell, campaign, options, registry, tally, {
				identity,
				spec,
				goalCardId,
				script,
				...(maxTicks !== undefined ? { maxTicks } : {})
			});
		}
		// A scenario's injections land in a world built here (WP44) — a world
		// that cannot take them refuses before the run, and the cell records it.
		// The cell's seed is the case's (WP63, `52-…` §2 item 4): two seeds are two customers, so a
		// parity gate has cohorts to compare. An injected world is built here with the same seed.
		// The world's injections and the session's faults, apart (WP72, `61-…` §2 item 2).
		const { world: worldInjections, faults: providerFaults } = splitInjections(scenario.injections);
		// A build's knobs reach the world at `create` (WP78), so the world is built here as an injected one is.
		const knobs = build.overrides?.knobs;
		// The rung of the context ladder reaches the world beside the knobs (WP81).
		const worldConfig = worldConfigFor(knobs, cell.context);
		const world =
			worldInjections.length > 0 || worldConfig !== undefined
				? injectedWorld(
						registry,
						goalCardId,
						worldInjections,
						scenario.id,
						createTestClock({ seed }).random,
						worldConfig
					)
				: undefined;
		const run = await runToCompletion({
			script,
			spec,
			...(world ? { world } : {}),
			...(providerFaults.length > 0 ? { providerFaults } : {}),
			stepLimit: (maxTicks ?? 30) + 10,
			idOffset: cell.ordinal * ID_STRIDE,
			seed,
			...(maxTicks !== undefined ? { maxTicks } : {}),
			...(brain.tier === 'live' ? { provider: providerForLive(brain, options) } : {}),
			...(options.egress !== undefined ? { egress: options.egress } : {}),
			...(options.principal !== undefined ? { principal: options.principal } : {}),
			...(options.packs !== undefined ? { packs: options.packs } : {})
		});

		const started = run.events.find((event) => event.type === 'run.started');
		const judged = await evaluateCell(campaign, run.events, options, scenario, tally);
		// The world's per-case metrics and the case's cohort, both from what the run left (WP61).
		const truth = evaluationInputFor(run.events).truth;
		const worldDefinition = registry.getWorld(registry.getGoalCard(goalCardId)?.worldId ?? '');
		const caseMetrics: Record<string, number> = {};
		for (const metric of worldDefinition?.metrics ?? []) {
			const value = metric.fold(run.events, truth);
			if (value !== undefined && Number.isFinite(value)) caseMetrics[metric.id] = value;
		}
		const cohort = cohortOf(truth);
		const scored: CampaignCell = {
			...identity,
			...(started ? { runId: started.runId } : {}),
			...(run.outcome !== undefined ? { outcome: run.outcome as RunOutcome } : {}),
			metrics: scoreRun(run.events),
			assertions: Object.fromEntries(
				campaign.assertionCards.map((card) => [card.id, evaluateAssertion(card, run.events).pass])
			),
			evaluations: judged.verdicts,
			labels: judged.labels,
			caseMetrics,
			...(cohort ? { cohort } : {})
		};
		options.onTrace?.(scored, { events: run.events, spec });
		return scored;
	} catch (error) {
		return {
			...identity,
			metrics: scoreRun([]),
			assertions: empty(),
			evaluations: {},
			labels: {},
			caseMetrics: {},
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/**
 * **A book cell** (WP80, `73-…` §4): one work item through the workflow the
 * source names, under the build's configuration (its own, or the source's)
 * with the build's knobs over the configuration's — the bot the build and
 * the guard fit at every agent stage, its plan looked up by the stage
 * card's id, the stage guards compiled from the policy cards they name,
 * every human stage answered by the workflow's own suggestion (a campaign
 * has no person). Scored over the workflow's events followed by every
 * agent run's, with the desk's truth as the journey left it — so the
 * evaluators, the assertions, the world's metrics and the cohort read as
 * a single-seat cell's do. The cell's `runId` is the last agent run's,
 * for the Run Lab; the workflow run's own id is on `cell.workflow`.
 */
async function runBookCell(
	cell: CampaignCellSpec,
	item: WorkItem,
	campaign: Campaign,
	noise: NoiseRates,
	options: RunCampaignOptions,
	registry: PackRegistry,
	tally: SpendTally,
	identity: Omit<
		CampaignCell,
		'metrics' | 'assertions' | 'evaluations' | 'labels' | 'caseMetrics' | 'counterpart'
	>
): Promise<CampaignCell> {
	const { scenario, build, brain, seed } = cell;
	const source = campaign.source as CampaignSource;
	const workflow = workflowOf(registry, source);
	const configurationId = build.overrides?.configuration ?? source.configuration;
	const named =
		configurationId === undefined ? undefined : workflow.configurations?.[configurationId];
	if (configurationId !== undefined && !named) {
		throw new Error(
			`build "${build.id}" names configuration "${configurationId}", which workflow "${workflow.id}" does not have`
		);
	}
	const knobs = { ...(named?.knobs ?? {}), ...(build.overrides?.knobs ?? {}) };
	const config: WorkflowConfig = {
		...(named ?? {}),
		...(Object.keys(knobs).length > 0 ? { knobs } : {}),
		...(cell.context ? { context: cell.context } : {})
	};
	const spec = specFor(cell);
	const seat = createTestClock({ seed, idOffset: cell.ordinal * ID_STRIDE });
	const journey = createTestClock({ seed, idOffset: cell.ordinal * ID_STRIDE + ID_STRIDE / 2 });
	const agentRuns: Array<{ runId: string; events: EngineEvent[]; spec: AgentSpecV2 }> = [];
	let truth: unknown;
	const packs = [starterPack, ...(options.packs ?? [])].filter(
		(pack, index, all) => all.findIndex((other) => other.id === pack.id) === index
	);
	const run = await runWorkflow(workflow, item, {
		packs,
		spec,
		config,
		providerFor: (_stage, goalCardId) =>
			brain.tier === 'live'
				? providerForLive(brain, options)
				: createMockProvider({
						script: scriptFor(brain.tier, goalCardId, seed, noise, options.plans ?? starterPlans)
					}),
		guardrailsFor: (cardIds) =>
			cardIds.flatMap((id): Guardrail[] => {
				const card = registry.getPolicyCard(id);
				if (!card) throw new Error(`stage guard names policy card "${id}", which no pack ships`);
				return compilePolicyCard(card);
			}),
		now: journey.now,
		newId: journey.newId,
		random: journey.random,
		session: {
			now: seat.now,
			newId: seat.newId,
			random: seat.random,
			tickDelayMs: 0,
			...(options.egress !== undefined ? { egress: options.egress } : {}),
			...(options.principal !== undefined ? { principal: options.principal } : {})
		},
		...(options.egress !== undefined ? { egress: options.egress } : {}),
		...(options.principal !== undefined ? { principal: options.principal } : {}),
		onAgentRun: (agentRun) => {
			agentRuns.push({
				runId: agentRun.runId,
				events: agentRun.events,
				spec: toSpecV2(agentRun.spec)
			});
		},
		onFinished: (world) => {
			truth = world.truth?.();
		}
	});

	const events: EngineEvent[] = [
		...agentRuns.flatMap((agentRun) => agentRun.events),
		...run.events
	];
	const judged = await evaluateCell(campaign, events, options, scenario, tally, truth);
	const worldDefinition = registry.getWorld(workflow.worldId);
	const caseMetrics: Record<string, number> = {};
	for (const metric of worldDefinition?.metrics ?? []) {
		const value = metric.fold(events, truth);
		if (value !== undefined && Number.isFinite(value)) caseMetrics[metric.id] = value;
	}
	const cohort = cohortOf(truth) ?? cohortOf(item.truth);
	const touched = touchedCaseOf(run, workflow.decisionKindOf);
	const ceilings = config.autonomy?.ceilings ?? {};
	const breaches = (touched.decisions ?? []).filter((decision) => {
		const ceiling = ceilings[decision.kind];
		return ceiling !== undefined && decision.level > ceiling;
	}).length;
	const last = agentRuns.at(-1);
	const outcome: RunOutcome =
		run.outcome === 'completed'
			? 'SUCCESS'
			: run.stages.some((stage) => stage.status === 'blocked')
				? 'STOPPED_BY_GUARDRAIL'
				: 'ERROR';
	const scored: CampaignCell = {
		...identity,
		...(last ? { runId: last.runId } : {}),
		outcome,
		metrics: scoreRun(events),
		assertions: Object.fromEntries(
			campaign.assertionCards.map((card) => [card.id, evaluateAssertion(card, events).pass])
		),
		evaluations: judged.verdicts,
		labels: judged.labels,
		caseMetrics,
		...(cohort ? { cohort } : {}),
		item: { id: item.id, kind: item.kind, customerId: item.customerId },
		workflow: {
			runId: run.id,
			...(configurationId !== undefined ? { configuration: configurationId } : {}),
			...(config.autonomy ? { autonomy: config.autonomy.level } : {}),
			outcome: run.outcome,
			stages: run.stages.map((stage) => ({
				stageId: stage.stageId,
				executor: stage.executor.kind,
				status: stage.status
			})),
			touches: touched.touches.map((touch) => touch.kind),
			decisions: touched.decisions ?? [],
			breaches
		}
	};
	if (last) options.onTrace?.(scored, { events: last.events, spec: last.spec });
	return scored;
}

/**
 * **A two-seat cell** (WP64, `56-LIVE-COUNTERPARTS.md` §4.1): the agent —
 * the cell's build, guard and brain exactly as a single-seat cell fits them
 * — and the seat across the desk, `counterpartSpec` on the campaign's
 * cartridge with its provider from `providerFor`, in a `SessionGroup` over
 * the scenario's world (injected and seeded here as a single seat's is,
 * through the group's `world` door), stepped in rounds. The cell is scored
 * on the agent's own events, never the seat's — the evaluators, the
 * assertions, the world's metrics and the cohort read the same trace a
 * solo cell would leave, filtered by the agent's run id. A guard's `group`
 * half is installed at the chokepoint: the group Watchbot's rules and
 * breaker, and an evaluator breaker per `breakOn`.
 */
async function runDuoCell(
	cell: CampaignCellSpec,
	campaign: Campaign,
	options: RunCampaignOptions,
	registry: PackRegistry,
	tally: SpendTally,
	prepared: {
		identity: Omit<
			CampaignCell,
			'metrics' | 'assertions' | 'evaluations' | 'labels' | 'caseMetrics' | 'counterpart'
		>;
		spec: AgentSpecV2;
		goalCardId: string;
		script: MockScript;
		maxTicks?: number;
	}
): Promise<CampaignCell> {
	const { scenario, build, guard, brain, seed } = cell;
	const { identity, spec, goalCardId, script, maxTicks } = prepared;
	const counterpart = campaign.counterpart as CampaignCounterpart;
	const cartridgeId = counterpart.cartridgeId ?? '';
	const clock = createTestClock({ seed, idOffset: cell.ordinal * ID_STRIDE });
	// The world is made here and handed to the group (`56-…` §4.1): injected
	// and seeded as a single seat's is, and read for the person it seated.
	const { card, world: worldDefinition } = deskFor(registry, goalCardId);
	const knobs = build.overrides?.knobs;
	const duoConfig = worldConfigFor(knobs, cell.context);
	const world =
		scenario.injections.length > 0
			? injectedWorld(
					registry,
					goalCardId,
					scenario.injections,
					scenario.id,
					clock.random,
					duoConfig
				)
			: worldDefinition.create(card.layoutId, {
					random: clock.random,
					...(duoConfig !== undefined ? { config: duoConfig } : {})
				});
	const { script: seatScript } = counterpartScriptFor(registry, goalCardId, world);
	const seat = counterpartSpec(
		seatScript,
		goalCardId,
		worldDefinition.id,
		cartridgeId,
		clock.newId(),
		clock.now()
	);
	const agentProvider =
		brain.tier === 'live' ? providerForLive(brain, options) : createMockProvider({ script });
	const seatProvider = providerForLive({ id: 'counterpart', tier: 'live', cartridgeId }, options);
	const stack = groupStackFor(guard, registry);
	const group = createSessionGroup({
		members: [
			{ spec, provider: agentProvider, role: 'agent' },
			{ spec: toSpecV2(seat), provider: seatProvider, role: 'counterpart' }
		],
		registry,
		goalCardId,
		world,
		...(stack.guardrails.length > 0 ? { groupGuardrails: stack.guardrails } : {}),
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			tickDelayMs: 0,
			...(options.egress !== undefined ? { egress: options.egress } : {}),
			...(options.principal !== undefined ? { principal: options.principal } : {}),
			...(maxTicks !== undefined ? { budgets: { maxTicks } } : {}),
			maxRounds: counterpart.maxRounds ?? 30,
			...(stack.observers.length > 0 ? { observers: stack.observers } : {})
		}
	});
	const merged: EngineEvent[] = [];
	group.events.onAny((event) => merged.push(event));
	for (const session of group.sessions) {
		session.events.on('approval.requested', () => session.resolveApproval(true, options.principal));
	}
	group.start('step');
	let outcome: RunOutcome | undefined;
	const rounds = counterpart.maxRounds ?? 30;
	for (let round = 0; round < rounds + 2 && outcome === undefined; round += 1) {
		const result = await group.stepRound();
		if (result.outcome) outcome = result.outcome;
	}
	if (outcome === undefined) group.stop('the campaign gave up');

	// The agent's own trace, as a solo cell would have left it.
	const agentRunId = group.sessions[0]?.runId;
	const seatRunId = group.sessions[1]?.runId;
	const events = merged.filter((event) => event.runId === agentRunId);
	const finished = events.find((event) => event.type === 'run.finished');
	const agentOutcome =
		finished?.type === 'run.finished' ? finished.payload.outcome : (outcome ?? 'STOPPED_BY_USER');
	const judged = await evaluateCell(campaign, events, options, scenario, tally);
	const truth = evaluationInputFor(events).truth;
	const caseMetrics: Record<string, number> = {};
	for (const metric of worldDefinition.metrics ?? []) {
		const value = metric.fold(events, truth);
		if (value !== undefined && Number.isFinite(value)) caseMetrics[metric.id] = value;
	}
	const cohort = cohortOf(truth);
	const scored: CampaignCell = {
		...identity,
		...(agentRunId !== undefined ? { runId: agentRunId } : {}),
		outcome: agentOutcome,
		metrics: scoreRun(events),
		assertions: Object.fromEntries(
			campaign.assertionCards.map((card) => [card.id, evaluateAssertion(card, events).pass])
		),
		evaluations: judged.verdicts,
		labels: judged.labels,
		caseMetrics,
		...(cohort ? { cohort } : {}),
		counterpart: {
			tier: 'live',
			name: seatScript.name,
			cartridgeId,
			...(seatRunId !== undefined ? { runId: seatRunId } : {})
		}
	};
	options.onTrace?.(scored, { events: merged, spec });
	return scored;
}

type GroupObserver = (events: EventBus, group: { groupRunId: string }) => Unsubscribe;

/** The chokepoint half of a guard (WP64, `56-…` §4.3): the group Watchbot and the evaluator breakers a file names — a two-seat cell's, and the harness's duo under `--stack`. */
export function groupStackFor(
	guard: CampaignGuard,
	registry: PackRegistry
): { guardrails: Guardrail[]; observers: GroupObserver[] } {
	const group = guard.group;
	if (!group) return { guardrails: [], observers: [] };
	const watchbot = createGroupWatchbot({
		watchFor: group.watchFor,
		...(group.refusalLimit !== undefined ? { refusalLimit: group.refusalLimit } : {})
	});
	const breakers = group.breakOn.flatMap((entry) => {
		const evaluator = resolveEvaluator(registry, entry.evaluatorId);
		if (!evaluator)
			throw new Error(`guard '${guard.id}' breaks on '${entry.evaluatorId}', which no pack ships`);
		return [
			createEvaluatorCircuitBreaker(evaluator, { labels: entry.labels, onFail: entry.onFail })
		];
	});
	return {
		guardrails: [...watchbot.guardrails, ...breakers],
		observers: group.watchFor.length > 0 ? [watchbot.observe] : []
	};
}

/**
 * Build → scenario `fit` → guard `fit`, each replacing any earlier brick in
 * the same socket — "fitted over" means the guard wins. Sockets are
 * single-occupancy (`validate-spec-v2.ts`); WP40 widens `safety`.
 */
/**
 * Every evaluator the campaign names, over one cell's trace (WP43). Ids are
 * resolved against the packs the runner has — a shipped evaluator or an
 * assertion card's adapter — and a non-deterministic evaluator always runs
 * its offline stand-in here: a campaign is a regression suite, and CI has
 * no model to ask. An id nobody ships is `inconclusive`, never a throw.
 */
async function evaluateCell(
	campaign: Campaign,
	events: readonly EngineEvent[],
	options: RunCampaignOptions,
	scenario: CampaignScenario,
	tally: SpendTally,
	/** The truth handed over directly (WP80): a workflow with no agent stage leaves no `run.finished` to carry it. */
	truthGiven?: unknown
): Promise<{
	verdicts: Record<string, 'pass' | 'fail' | 'inconclusive'>;
	labels: Record<string, string>;
}> {
	const labels: Record<string, string> = {};
	if (campaign.evaluators.length === 0) return { verdicts: {}, labels };
	const registry = createPackRegistry();
	registry.registerPack(starterPack);
	for (const pack of options.packs ?? []) {
		if (!registry.listPacks().some((installed) => installed.id === pack.id))
			registry.registerPack(pack);
	}
	const read = evaluationInputFor(events, undefined, scenario);
	const input =
		truthGiven !== undefined && read.truth === undefined ? { ...read, truth: truthGiven } : read;
	const verdicts: Record<string, 'pass' | 'fail' | 'inconclusive'> = {};
	for (const named of campaign.evaluators) {
		const evaluator = resolveEvaluator(registry, named.id);
		if (!evaluator) {
			verdicts[named.id] = 'inconclusive';
			continue;
		}
		// A hosted evaluator runs live only under a budget, with its battery and a config (WP51); the rest as before.
		const live = runsLive(campaign, named, evaluator, options);
		const runner =
			evaluator.kind === 'deterministic' || live ? evaluator : evaluator.createOffline?.();
		if (!runner) {
			verdicts[named.id] = 'inconclusive';
			continue;
		}
		try {
			if (live) tally.liveEvaluations += 1;
			const result = await runner.evaluate(inputReadableBy(evaluator, input), {
				config: named.config,
				fetch: live
					? (options.fetch ?? globalThis.fetch.bind(globalThis))
					: () => Promise.reject(new Error('a campaign evaluates offline')),
				getCredential: (id) => (live ? options.credentials?.(id) : undefined)
			});
			verdicts[named.id] = result.verdict ?? 'inconclusive';
			if (result.label !== undefined) labels[named.id] = result.label;
		} catch {
			verdicts[named.id] = 'inconclusive';
		}
	}
	return { verdicts, labels };
}

/** The cohort a truth block carries (WP61, `50-…` §4.3): a flat record of strings under `cohort`, or nothing. */
export function cohortOf(truth: unknown): Record<string, string> | undefined {
	const block = (truth as { cohort?: unknown } | undefined)?.cohort;
	if (!block || typeof block !== 'object' || Array.isArray(block)) return undefined;
	const entries = Object.entries(block as Record<string, unknown>).filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''
	);
	return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

export function specFor(cell: Pick<CampaignCellSpec, 'scenario' | 'build' | 'guard'>): AgentSpecV2 {
	const { scenario, build, guard } = cell;
	let spec: AgentSpecV2;
	const goalCardId = goalCardOf(scenario);
	if (build.base.kind === 'kit') {
		spec = { ...build.base.kit.agent, goalCardId };
	} else {
		const v1 = buildSpec({ goalCardId, ...cleanOverrides(build.overrides) });
		const migrated = migrateAgentSpec(v1);
		if ('kind' in migrated) throw new Error(migrated.message);
		spec = migrated;
	}
	return fit(fit(spec, scenario.fit), guard.fit);
}

function fit(spec: AgentSpecV2, bricks: readonly FittedBrick[]): AgentSpecV2 {
	if (bricks.length === 0) return spec;
	const kept = spec.bricks.filter((brick) => !bricks.some((fitted) => fitted.slot === brick.slot));
	return { ...spec, bricks: [...kept, ...bricks] };
}

/** The world's create-time config for a cell (WP78, WP81): the build's knobs and the cell's context rung, or nothing. */
function worldConfigFor(
	knobs: Record<string, number | string | boolean> | undefined,
	context: ContextSpec | undefined
): Record<string, unknown> | undefined {
	if (knobs === undefined && context === undefined) return undefined;
	return {
		...(knobs !== undefined ? { knobs } : {}),
		...(context !== undefined ? { context } : {})
	};
}

/** `exactOptionalPropertyTypes`: a parsed optional is `T | undefined`, which `SpecOverrides` does not admit — drop the undefineds. */
function cleanOverrides(
	overrides: CampaignBuild['overrides']
): Omit<SpecOverrides, 'goalCardId' | 'tools'> {
	if (!overrides) return {};
	return Object.fromEntries(
		// `knobs` are the world's and `configuration` the workflow's, not the spec's (WP78, WP80).
		Object.entries(overrides).filter(
			([key, value]) => key !== 'knobs' && key !== 'configuration' && value !== undefined
		)
	) as Omit<SpecOverrides, 'goalCardId' | 'tools'>;
}

function scriptFor(
	tier: EvalTier,
	goalCardId: string,
	seed: number,
	noise: NoiseRates,
	plans: PlanSource
) {
	switch (tier) {
		case 'scripted-adversary':
			return scriptedAdversary(plans.adversaryPlanFor(goalCardId));
		case 'scripted-counterpart':
			// A counterpart's brain, never the agent's (`46-…` §4.5); a two-seat cell is WP58's shape.
			throw new Error(
				'scripted-counterpart is a counterpart seat’s brain and cannot drive a campaign cell’s agent'
			);
		case 'scripted-noisy':
			return scriptedNoisy(plans.planFor(goalCardId), { seed, rates: noise });
		case 'scripted-optimal':
			return scriptedOptimal(plans.planFor(goalCardId));
		case 'live':
			// A live cell is driven by its provider; the script is only what the
			// harness's own signature requires, and is never consulted.
			return scriptedOptimal(planIfAny(goalCardId, plans));
	}
}

function planIfAny(goalCardId: string, plans: PlanSource): Plan {
	try {
		return plans.planFor(goalCardId);
	} catch {
		return [];
	}
}

function providerForLive(brain: CampaignBrain, options: RunCampaignOptions): LLMProvider {
	const provider = options.providerFor?.(brain);
	if (!provider) {
		throw new Error(`the "${brain.id}" brain is live and no providerFor was supplied`);
	}
	return provider;
}

// ── Gates ───────────────────────────────────────────────────────────────────

export interface GateOptions {
	/** What a labelled evaluator's labels mean, for `derived-metric`, `parity` and the derived metric names. */
	semantics?: (evaluatorId: string) => ConfusionLabelSemantics | undefined;
	/** Which instrument the report being gated is (WP64); a `no-regression` gate refuses a baseline of the other. */
	counterpart?: CampaignCounterpart;
}

export function evaluateGate(
	gate: Gate,
	cells: readonly CampaignCell[],
	baseline?: CampaignReport,
	options: GateOptions = {}
): GateVerdict {
	const selected = selectCells(gate.where, cells);
	const base = {
		id: gate.id,
		kind: gate.require.kind,
		...(gate.where ? { where: gate.where } : {}),
		cells: selected.length
	};
	const require = gate.require;

	if (require.kind === 'no-regression') {
		if (!baseline) {
			return {
				...base,
				required: `no slice falls by more than ${pct(require.tolerance)}`,
				passed: true,
				inconclusive: true
			};
		}
		// The `compareToBaseline` precedent: a report from another schema is not the same instrument.
		if (baseline.schemaVersion !== CAMPAIGN_REPORT_SCHEMA_VERSION) {
			return {
				...base,
				required: `no slice falls by more than ${pct(require.tolerance)} — baseline is schema v${baseline.schemaVersion}, this report is v${CAMPAIGN_REPORT_SCHEMA_VERSION}`,
				passed: true,
				inconclusive: true
			};
		}
		// Nor is a report against another seat (WP64, `56-…` §4.2): a scripted seat and a live one are two instruments.
		const thisTier = options.counterpart?.tier ?? 'scripted';
		const baselineTier = baseline.counterpart?.tier ?? 'scripted';
		if (baselineTier !== thisTier) {
			return {
				...base,
				required: `no slice falls by more than ${pct(require.tolerance)} — not comparable: the baseline's counterpart is ${baselineTier}, this report's is ${thisTier}`,
				passed: true,
				inconclusive: true
			};
		}
		const worst = worstDrop(selected, baseline);
		return {
			...base,
			required: `no slice falls by more than ${pct(require.tolerance)}`,
			observed: worst,
			passed: worst <= require.tolerance + 1e-9
		};
	}

	// A rule nobody ran is not a rule that held.
	if (selected.length === 0) {
		return { ...base, required: describeRequirement(require), passed: false };
	}

	let observed: number;
	switch (require.kind) {
		case 'outcome-rate':
			observed = rate(selected, (cell) => cell.outcome === require.outcome);
			break;
		case 'assertion-pass-rate':
			observed = rate(selected, (cell) => cell.assertions[require.cardId] === true);
			break;
		case 'evaluator-pass-rate': {
			// Inconclusive cells are left out; none left is an inconclusive gate, as `no-regression` is.
			const judged = selected.filter(
				(cell) =>
					cell.evaluations[require.evaluatorId] !== undefined &&
					cell.evaluations[require.evaluatorId] !== 'inconclusive'
			);
			if (judged.length === 0) {
				return {
					...base,
					required: describeRequirement(require),
					passed: true,
					inconclusive: true
				};
			}
			observed = rate(judged, (cell) => cell.evaluations[require.evaluatorId] === 'pass');
			break;
		}
		case 'metric': {
			const folded = metricOver(selected, require.name, require.aggregate, options);
			if (folded === undefined) {
				return {
					...base,
					required: describeRequirement(require),
					passed: true,
					inconclusive: true
				};
			}
			observed = folded;
			break;
		}
		case 'derived-metric': {
			const semantics = options.semantics?.(require.evaluatorId);
			const value = semantics
				? derivedOf(selected, require.evaluatorId, require.derived, semantics)
				: undefined;
			if (value === undefined) {
				return {
					...base,
					required: describeRequirement(require),
					passed: true,
					inconclusive: true
				};
			}
			observed = value;
			break;
		}
		case 'label-rate': {
			const value = labelRate(selected, require.evaluatorId, require.label);
			if (value === undefined) {
				return {
					...base,
					required: describeRequirement(require),
					passed: true,
					inconclusive: true
				};
			}
			observed = value;
			break;
		}
		case 'parity': {
			const values = parityValues(selected, require, options);
			const required = describeRequirement(require);
			if (Object.keys(values).length < 2) {
				return { ...base, required, passed: true, inconclusive: true, matched: require.matched };
			}
			const numbers = Object.values(values);
			const max = Math.max(...numbers);
			const min = Math.min(...numbers);
			const difference = max - min;
			const ratio = max === 0 ? 1 : min / max;
			const held =
				(require.maxDifference === undefined || difference <= require.maxDifference + 1e-9) &&
				(require.minRatio === undefined || ratio >= require.minRatio - 1e-9);
			return {
				...base,
				required,
				observed: require.maxDifference !== undefined ? difference : ratio,
				passed: held,
				matched: require.matched,
				values
			};
		}
	}
	const passed =
		(require.atLeast === undefined || observed >= require.atLeast - 1e-9) &&
		(require.atMost === undefined || observed <= require.atMost + 1e-9);
	return { ...base, required: describeRequirement(require), observed, passed };
}

/** The cells a gate's `where` names — exported so a renderer can list a failed gate's runs. */
export function selectCells(
	where: GateWhere | undefined,
	cells: readonly CampaignCell[]
): CampaignCell[] {
	return cells.filter((cell) => matches(where, cell));
}

function matches(where: GateWhere | undefined, cell: CampaignCell): boolean {
	if (!where) return true;
	if (where.scenario !== undefined && cell.scenario !== where.scenario) return false;
	if (where.build !== undefined && cell.build !== where.build) return false;
	if (where.guard !== undefined && cell.guard !== where.guard) return false;
	if (where.brain !== undefined && cell.brain !== where.brain) return false;
	if (where.context !== undefined && cell.context !== where.context) return false;
	if (where.tag !== undefined && !cell.tags.includes(where.tag)) return false;
	if (where.cohort !== undefined) {
		const at = where.cohort.indexOf('=');
		const attribute = where.cohort.slice(0, at);
		const value = where.cohort.slice(at + 1);
		if (cell.cohort?.[attribute] !== value) return false;
	}
	return true;
}

/** One label's share of the cells the evaluator labelled; `undefined` when it labelled none. */
function labelRate(cells: readonly CampaignCell[], evaluatorId: string, label: string) {
	const labelled = cells.filter((cell) => cell.labels?.[evaluatorId] !== undefined);
	if (labelled.length === 0) return undefined;
	return rate(labelled, (cell) => cell.labels?.[evaluatorId] === label);
}

/** A `metric` gate's number over a set: a run metric per cell, a case metric per cell that has it, or a derived rate over the set. */
function metricOver(
	cells: readonly CampaignCell[],
	name: MetricName,
	how: 'mean' | 'median' | 'max',
	options: GateOptions
): number | undefined {
	const derived = DERIVED_METRIC_PATTERN.exec(name);
	if (derived) {
		const [, evaluatorId, which] = derived as unknown as [string, string, DerivedName];
		const semantics = options.semantics?.(evaluatorId);
		return semantics ? derivedOf(cells, evaluatorId, which, semantics) : undefined;
	}
	if (CASE_METRIC_PATTERN.test(name)) {
		const id = name.slice('case:'.length);
		const values = cells
			.map((cell) => cell.caseMetrics?.[id])
			.filter((value): value is number => value !== undefined);
		return values.length === 0 ? undefined : aggregate(values, how);
	}
	return aggregate(
		cells.map((cell) => metricValue(cell.metrics, name as RunMetricName)),
		how
	);
}

/** A parity gate's number in every value of the attribute (cells with none left out; a value with nothing to judge left out). */
function parityValues(
	cells: readonly CampaignCell[],
	require: Extract<GateRequire, { kind: 'parity' }>,
	options: GateOptions
): Record<string, number> {
	const groups = new Map<string, CampaignCell[]>();
	for (const cell of cells) {
		const value = cell.cohort?.[require.across];
		if (value === undefined) continue;
		const list = groups.get(value);
		if (list) list.push(cell);
		else groups.set(value, [cell]);
	}
	const values: Record<string, number> = {};
	for (const [value, mine] of groups) {
		const of = require.of;
		let number: number | undefined;
		switch (of.kind) {
			case 'outcome-rate':
				number = rate(mine, (cell) => cell.outcome === of.outcome);
				break;
			case 'evaluator-pass-rate': {
				const judged = mine.filter(
					(cell) =>
						cell.evaluations[of.evaluatorId] !== undefined &&
						cell.evaluations[of.evaluatorId] !== 'inconclusive'
				);
				number =
					judged.length === 0
						? undefined
						: rate(judged, (cell) => cell.evaluations[of.evaluatorId] === 'pass');
				break;
			}
			case 'label-rate':
				number = labelRate(mine, of.evaluatorId, of.label);
				break;
			case 'derived-metric': {
				const semantics = options.semantics?.(of.evaluatorId);
				number = semantics ? derivedOf(mine, of.evaluatorId, of.derived, semantics) : undefined;
				break;
			}
			case 'metric':
				number = metricOver(mine, of.name, of.aggregate, options);
				break;
		}
		if (number !== undefined) values[value] = number;
	}
	return values;
}

function rate(cells: readonly CampaignCell[], match: (cell: CampaignCell) => boolean): number {
	return cells.filter(match).length / cells.length;
}

/** Over the stored shape (a parsed cell's metrics), which `RunMetrics` narrows only in its optional keys. */
export function metricValue(metrics: CampaignCell['metrics'], name: RunMetricName): number {
	switch (name) {
		case 'loop.longestStreak':
			return metrics.loop.longestStreak;
		case 'loop.repeatedFailures':
			return metrics.loop.repeatedFailures;
		case 'guardrailTrips':
			return Object.values(metrics.guardrailTrips).reduce((total, trips) => total + trips, 0);
		default:
			return metrics[name];
	}
}

function aggregate(values: number[], how: 'mean' | 'median' | 'max'): number {
	if (values.length === 0) return 0;
	if (how === 'max') return Math.max(...values);
	if (how === 'mean') return values.reduce((total, value) => total + value, 0) / values.length;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
		: (sorted[middle] as number);
}

/** The largest fall in success rate between a slice (scenario × guard × brain) now and in the baseline; 0 when nothing fell. */
function worstDrop(cells: readonly CampaignCell[], baseline: CampaignReport): number {
	const sliceOf = (cell: CampaignCell) => `${cell.scenario} ${cell.guard} ${cell.brain}`;
	const now = successBySlice(cells, sliceOf);
	const scenarios = new Set(cells.map((cell) => cell.scenario));
	const then = successBySlice(
		baseline.cells.filter((cell) => scenarios.has(cell.scenario)),
		sliceOf
	);
	let worst = 0;
	for (const [slice, current] of now) {
		const previous = then.get(slice);
		if (previous === undefined) continue;
		worst = Math.max(worst, previous - current);
	}
	return worst;
}

function successBySlice(cells: readonly CampaignCell[], sliceOf: (cell: CampaignCell) => string) {
	const groups = new Map<string, CampaignCell[]>();
	for (const cell of cells) {
		const list = groups.get(sliceOf(cell));
		if (list) list.push(cell);
		else groups.set(sliceOf(cell), [cell]);
	}
	return new Map(
		[...groups].map(([slice, mine]) => [slice, rate(mine, (c) => c.outcome === 'SUCCESS')])
	);
}

export function describeRequirement(require: GateRequire): string {
	switch (require.kind) {
		case 'outcome-rate':
			return `${require.outcome} rate ${bounds(require.atLeast, require.atMost)}`;
		case 'assertion-pass-rate':
			return `${require.cardId} pass rate ${bounds(require.atLeast, require.atMost)}`;
		case 'evaluator-pass-rate':
			return `${require.evaluatorId} verdict pass rate ${bounds(require.atLeast, require.atMost)}`;
		case 'metric':
			return `${require.aggregate} ${require.name} ${bounds(require.atLeast, require.atMost, false)}`;
		case 'no-regression':
			return `no slice falls by more than ${pct(require.tolerance)}`;
		case 'derived-metric':
			return `${require.evaluatorId} ${require.derived} ${bounds(require.atLeast, require.atMost)}`;
		case 'label-rate':
			return `${require.evaluatorId} label "${require.label}" rate ${bounds(require.atLeast, require.atMost)}`;
		case 'parity': {
			const of = require.of;
			const measure =
				of.kind === 'outcome-rate'
					? `${of.outcome} rate`
					: of.kind === 'evaluator-pass-rate'
						? `${of.evaluatorId} pass rate`
						: of.kind === 'label-rate'
							? `${of.evaluatorId} label "${of.label}" rate`
							: of.kind === 'derived-metric'
								? `${of.evaluatorId} ${of.derived}`
								: `${of.aggregate} ${of.name}`;
			const bound = [
				...(require.maxDifference !== undefined ? [`spread ≤ ${require.maxDifference}`] : []),
				...(require.minRatio !== undefined ? [`ratio ≥ ${require.minRatio}`] : [])
			].join(' and ');
			return `${measure} across ${require.across}: ${bound || '(no bound)'}${require.matched ? '' : ' (unmatched cohorts)'}`;
		}
	}
}

function bounds(atLeast: number | undefined, atMost: number | undefined, asRate = true): string {
	const show = (value: number) => (asRate ? pct(value) : String(value));
	const parts: string[] = [];
	if (atLeast !== undefined) parts.push(`≥ ${show(atLeast)}`);
	if (atMost !== undefined) parts.push(`≤ ${show(atMost)}`);
	return parts.join(' and ') || '(no bound)';
}

export function pct(value: number): string {
	return `${Math.round(value * 100)}%`;
}
