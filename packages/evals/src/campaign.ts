import type { EgressMode } from '@craftabot/core';
import { z } from 'zod';
import {
	assertionCardSchema,
	fittedBrickSchema,
	kitFileSchema,
	migrateAgentSpec,
	runOutcomeSchema,
	type AgentSpecV2,
	type EngineEvent,
	type FittedBrick,
	type LLMProvider,
	type RunOutcome
} from '@craftabot/core';
import {
	adversaryPlanFor,
	buildSpec,
	planFor,
	runToCompletion,
	type Plan,
	type SpecOverrides
} from '@craftabot/pack-starter/testing';
import { evaluateAssertion } from './assertions.js';
import {
	DEFAULT_NOISE,
	scriptedAdversary,
	scriptedNoisy,
	scriptedOptimal,
	type NoiseRates
} from './brains.js';
import { scoreRun } from './metrics.js';
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
export const CAMPAIGN_REPORT_SCHEMA_VERSION = 1;

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
	personality: z.string().optional()
});

export const noiseRatesSchema = z.object({
	misname: z.number().min(0).max(1),
	wastedMove: z.number().min(0).max(1),
	prematureCelebrate: z.number().min(0).max(1)
});

export const metricNameSchema = z.enum([
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
	brain: z.string().optional()
});
export type GateWhere = z.infer<typeof gateWhereSchema>;

export const gateRequireSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('outcome-rate'), outcome: runOutcomeSchema, ...rateBounds }),
	z.object({ kind: z.literal('assertion-pass-rate'), cardId: z.string().min(1), ...rateBounds }),
	z.object({
		kind: z.literal('metric'),
		name: metricNameSchema,
		aggregate: z.enum(['mean', 'median', 'max']).default('mean'),
		atMost: z.number().optional(),
		atLeast: z.number().optional()
	}),
	z.object({ kind: z.literal('no-regression'), tolerance: z.number().min(0).max(1).default(0) })
]);
export type GateRequire = z.infer<typeof gateRequireSchema>;

export const gateSchema = z.object({
	id: z.string().min(1),
	where: gateWhereSchema.optional(),
	require: gateRequireSchema
});
export type Gate = z.infer<typeof gateSchema>;

export const campaignScenarioSchema = z.object({
	id: z.string().min(1),
	goalCardId: z.string().min(1),
	tags: z.array(z.string()).default([]),
	fit: z.array(fittedBrickSchema).default([]),
	maxTicks: z.number().int().positive().optional()
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

export const campaignGuardSchema = z.object({
	id: z.string().min(1),
	fit: z.array(fittedBrickSchema).default([]),
	for: z.array(z.string()).optional()
});
export type CampaignGuard = z.infer<typeof campaignGuardSchema>;

export const campaignBrainSchema = z.object({
	id: z.string().min(1),
	tier: evalTierSchema,
	cartridgeId: z.string().optional()
});
export type CampaignBrain = z.infer<typeof campaignBrainSchema>;

export const campaignSchema = z.object({
	schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
	id: z.string().min(1),
	title: z.string().min(1),
	scenarios: z.array(campaignScenarioSchema).min(1),
	builds: z.array(campaignBuildSchema).min(1),
	guards: z.array(campaignGuardSchema).min(1),
	brains: z.array(campaignBrainSchema).min(1),
	seeds: z.array(z.number().int()).min(1),
	noise: noiseRatesSchema.partial().optional(),
	assertionCards: z.array(assertionCardSchema).default([]),
	gates: z.array(gateSchema).min(1),
	budget: z
		.object({
			maxLiveCells: z.number().int().positive(),
			maxTokens: z.number().int().positive().optional()
		})
		.optional()
});
export type Campaign = z.infer<typeof campaignSchema>;

export function parseCampaign(value: unknown): Campaign {
	return campaignSchema.parse(value);
}

export const campaignCellSchema = z.object({
	scenario: z.string(),
	build: z.string(),
	guard: z.string(),
	brain: z.string(),
	tier: evalTierSchema,
	seed: z.number().int(),
	/** The scenario's tags, carried so a report can be grouped and gated by them without the campaign. */
	tags: z.array(z.string()).default([]),
	runId: z.string().optional(),
	outcome: runOutcomeSchema.optional(),
	metrics: runMetricsSchema,
	assertions: z.record(z.string(), z.boolean()),
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
	inconclusive: z.literal(true).optional()
});
export type GateVerdict = z.infer<typeof gateVerdictSchema>;

export const campaignReportSchema = z.object({
	schemaVersion: z.literal(CAMPAIGN_REPORT_SCHEMA_VERSION),
	id: z.string(),
	campaignId: z.string(),
	campaignTitle: z.string(),
	createdAt: z.string(),
	packVersions: z.record(z.string(), z.string()),
	noise: noiseRatesSchema,
	cells: z.array(campaignCellSchema),
	gates: z.array(gateVerdictSchema),
	passed: z.boolean(),
	budget: z.object({
		liveCells: z.number().int().nonnegative(),
		tokensIn: z.number().int().nonnegative(),
		tokensOut: z.number().int().nonnegative()
	})
});
export type CampaignReport = z.infer<typeof campaignReportSchema>;

export function parseCampaignReport(value: unknown): CampaignReport {
	return campaignReportSchema.parse(value);
}

/** One cell, before it runs: the point in the campaign's five axes. */
export interface CampaignCellSpec {
	scenario: CampaignScenario;
	build: CampaignBuild;
	guard: CampaignGuard;
	brain: CampaignBrain;
	seed: number;
	ordinal: number;
}

/** Every cell a campaign will run, in the order it will run them — scenarios × builds × guards(applicable) × brains × seeds. */
export function campaignCells(campaign: Campaign): CampaignCellSpec[] {
	const cells: CampaignCellSpec[] = [];
	for (const scenario of campaign.scenarios) {
		for (const build of campaign.builds) {
			for (const guard of campaign.guards) {
				if (guard.for !== undefined && !guard.for.includes(scenario.id)) continue;
				for (const brain of campaign.brains) {
					for (const seed of campaign.seeds) {
						cells.push({ scenario, build, guard, brain, seed, ordinal: cells.length });
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
}

/** The same stride the matrix uses (`runner.ts`), for the same reason: a cell's ids depend only on its position. */
const ID_STRIDE = 100_000;

export async function runCampaign(
	campaign: Campaign,
	options: RunCampaignOptions = {}
): Promise<CampaignReport> {
	const cells = campaignCells(campaign);
	const noise = noiseFor(campaign.noise);
	guardBudget(campaign, cells);

	const results: CampaignCell[] = [];
	for (const spec of cells) {
		const cell = await runCell(spec, campaign, noise, options);
		results.push(cell);
		options.onCell?.(cell, results.length, cells.length);
		if (options.betweenCells) await options.betweenCells();
	}

	const gates = campaign.gates.map((gate) => evaluateGate(gate, results, options.baseline));
	return {
		schemaVersion: CAMPAIGN_REPORT_SCHEMA_VERSION,
		id: options.newId?.() ?? crypto.randomUUID(),
		campaignId: campaign.id,
		campaignTitle: campaign.title,
		createdAt: options.now?.() ?? new Date().toISOString(),
		packVersions: options.packVersions ?? {},
		noise,
		cells: results,
		gates,
		passed: gates.every((gate) => gate.passed),
		budget: {
			liveCells: results.filter((cell) => cell.tier === 'live').length,
			tokensIn: results.reduce((total, cell) => total + cell.metrics.tokensIn, 0),
			tokensOut: results.reduce((total, cell) => total + cell.metrics.tokensOut, 0)
		}
	};
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
function guardBudget(campaign: Campaign, cells: CampaignCellSpec[]): void {
	const live = cells.filter((cell) => cell.brain.tier === 'live').length;
	if (live === 0) return;
	if (!campaign.budget) {
		throw new Error(
			`campaign '${campaign.id}' has ${live} live cell${live === 1 ? '' : 's'} and no budget — add "budget": { "maxLiveCells": N } to run them, or drop the live brain`
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
	options: RunCampaignOptions
): Promise<CampaignCell> {
	const { scenario, build, guard, brain, seed } = cell;
	const identity = {
		scenario: scenario.id,
		build: build.id,
		guard: guard.id,
		brain: brain.id,
		tier: brain.tier,
		seed,
		tags: scenario.tags
	};
	const empty = () => Object.fromEntries(campaign.assertionCards.map((card) => [card.id, false]));

	try {
		const spec = specFor(cell);
		const script = scriptFor(brain.tier, scenario.goalCardId, seed, noise);
		const maxTicks = scenario.maxTicks;
		const run = await runToCompletion({
			script,
			spec,
			stepLimit: (maxTicks ?? 30) + 10,
			idOffset: cell.ordinal * ID_STRIDE,
			...(maxTicks !== undefined ? { maxTicks } : {}),
			...(brain.tier === 'live' ? { provider: providerForLive(brain, options) } : {}),
			...(options.egress !== undefined ? { egress: options.egress } : {})
		});

		const started = run.events.find((event) => event.type === 'run.started');
		const scored: CampaignCell = {
			...identity,
			...(started ? { runId: started.runId } : {}),
			...(run.outcome !== undefined ? { outcome: run.outcome as RunOutcome } : {}),
			metrics: scoreRun(run.events),
			assertions: Object.fromEntries(
				campaign.assertionCards.map((card) => [card.id, evaluateAssertion(card, run.events).pass])
			)
		};
		options.onTrace?.(scored, { events: run.events, spec });
		return scored;
	} catch (error) {
		return {
			...identity,
			metrics: scoreRun([]),
			assertions: empty(),
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/**
 * Build → scenario `fit` → guard `fit`, each replacing any earlier brick in
 * the same socket — "fitted over" means the guard wins. Sockets are
 * single-occupancy (`validate-spec-v2.ts`); WP40 widens `safety`.
 */
export function specFor(cell: Pick<CampaignCellSpec, 'scenario' | 'build' | 'guard'>): AgentSpecV2 {
	const { scenario, build, guard } = cell;
	let spec: AgentSpecV2;
	if (build.base.kind === 'kit') {
		spec = { ...build.base.kit.agent, goalCardId: scenario.goalCardId };
	} else {
		const v1 = buildSpec({ goalCardId: scenario.goalCardId, ...cleanOverrides(build.overrides) });
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

/** `exactOptionalPropertyTypes`: a parsed optional is `T | undefined`, which `SpecOverrides` does not admit — drop the undefineds. */
function cleanOverrides(
	overrides: CampaignBuild['overrides']
): Omit<SpecOverrides, 'goalCardId' | 'tools'> {
	if (!overrides) return {};
	return Object.fromEntries(
		Object.entries(overrides).filter(([, value]) => value !== undefined)
	) as Omit<SpecOverrides, 'goalCardId' | 'tools'>;
}

function scriptFor(tier: EvalTier, goalCardId: string, seed: number, noise: NoiseRates) {
	switch (tier) {
		case 'scripted-adversary':
			return scriptedAdversary(adversaryPlanFor(goalCardId));
		case 'scripted-noisy':
			return scriptedNoisy(planFor(goalCardId), { seed, rates: noise });
		case 'scripted-optimal':
			return scriptedOptimal(planFor(goalCardId));
		case 'live':
			// A live cell is driven by its provider; the script is only what the
			// harness's own signature requires, and is never consulted.
			return scriptedOptimal(planIfAny(goalCardId));
	}
}

function planIfAny(goalCardId: string): Plan {
	try {
		return planFor(goalCardId);
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

export function evaluateGate(
	gate: Gate,
	cells: readonly CampaignCell[],
	baseline?: CampaignReport
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
		case 'metric': {
			const values = selected.map((cell) => metricValue(cell.metrics, require.name));
			observed = aggregate(values, require.aggregate);
			break;
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
	if (where.tag !== undefined && !cell.tags.includes(where.tag)) return false;
	return true;
}

function rate(cells: readonly CampaignCell[], match: (cell: CampaignCell) => boolean): number {
	return cells.filter(match).length / cells.length;
}

/** Over the stored shape (a parsed cell's metrics), which `RunMetrics` narrows only in its optional keys. */
export function metricValue(metrics: CampaignCell['metrics'], name: MetricName): number {
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
		case 'metric':
			return `${require.aggregate} ${require.name} ${bounds(require.atLeast, require.atMost, false)}`;
		case 'no-regression':
			return `no slice falls by more than ${pct(require.tolerance)}`;
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
