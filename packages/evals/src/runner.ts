import type { LLMProvider } from '@craftabot/core';
import {
	PLAN_TOOLS,
	buildSpec,
	planFor,
	runToCompletion,
	type SpecOverrides
} from '@craftabot/pack-starter/testing';
import { DEFAULT_NOISE, scriptedNoisy, scriptedOptimal, type NoiseRates } from './brains.js';
import { scoreRun } from './metrics.js';
import {
	EVAL_REPORT_SCHEMA_VERSION,
	summarise,
	type EvalCell,
	type EvalReport,
	type EvalTier
} from './report.js';

/**
 * **The matrix executor** (`13-…` §8): every cell of
 * `{goalCard × brain × brickConfig × seed}`, run to completion and scored.
 *
 * Sequential, deliberately. These runs are cheap and pure, so parallelism would
 * buy a few seconds and cost the one property the harness exists for: a matrix
 * that produces the same report twice. It also keeps a live lane's rate limits
 * and spend a matter of arithmetic rather than of luck.
 *
 * A cell that throws is **recorded, not swallowed**. A runner that dropped
 * failures would report a smaller, healthier matrix than the one that ran, and
 * the missing cells would look like a configuration choice rather than a bug.
 */

export interface MatrixBrain {
	/** The column in the grid: a scripted tier, or a real cartridge. */
	id: string;
	tier: EvalTier;
	/**
	 * Fitted for `live` cells. Scripted tiers ignore it — they answer from a
	 * plan, and the brick they are notionally in has nothing to do.
	 */
	cartridgeId?: string;
}

export interface MatrixConfig {
	/** The name this variation goes by in the report and the scorecard. */
	id: string;
	/** What to change about the bot. `{}` is the fully-fitted default. */
	overrides?: Omit<SpecOverrides, 'goalCardId'>;
	/**
	 * Turn budget for cells in this configuration. The expert card needs more
	 * than the platform default and says so, so this is per-configuration rather
	 * than global.
	 */
	maxTicks?: number;
}

export interface MatrixSpec {
	goalCardIds: string[];
	brains: MatrixBrain[];
	configs: MatrixConfig[];
	seeds: number[];
	noise?: Partial<NoiseRates>;
}

export interface RunMatrixOptions {
	/**
	 * Where a `live` cell's provider comes from. Absent, a live cell fails with
	 * a message that says so — rather than quietly falling back to the mock and
	 * filing scripted numbers under a real model's name, which is the worst
	 * available outcome for a document whose whole job is to be trusted.
	 */
	providerFor?: (brain: MatrixBrain) => LLMProvider;
	/** Injected so a test can assert a whole report, timestamp and all. */
	now?: () => string;
	newId?: () => string;
	/** Called after each cell, for a progress line on a long matrix. */
	onCell?: (cell: EvalCell, index: number, total: number) => void;
}

export function matrixSize(spec: MatrixSpec): number {
	return spec.goalCardIds.length * spec.brains.length * spec.configs.length * spec.seeds.length;
}

export async function runMatrix(
	spec: MatrixSpec,
	options: RunMatrixOptions = {}
): Promise<EvalReport> {
	const noise = { ...DEFAULT_NOISE, ...spec.noise };
	const cells: EvalCell[] = [];
	const total = matrixSize(spec);

	for (const goalCardId of spec.goalCardIds) {
		for (const brain of spec.brains) {
			for (const config of spec.configs) {
				for (const seed of spec.seeds) {
					const cell = await runCell({ goalCardId, brain, config, seed, noise }, options);
					cells.push(cell);
					options.onCell?.(cell, cells.length, total);
				}
			}
		}
	}

	return {
		schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
		id: options.newId?.() ?? crypto.randomUUID(),
		createdAt: options.now?.() ?? new Date().toISOString(),
		matrix: {
			goalCardIds: [...spec.goalCardIds],
			brains: spec.brains.map((brain) => ({ id: brain.id, tier: brain.tier })),
			configIds: spec.configs.map((config) => config.id),
			seeds: [...spec.seeds],
			noise
		},
		cells,
		summaries: summarise(cells)
	};
}

interface CellSpec {
	goalCardId: string;
	brain: MatrixBrain;
	config: MatrixConfig;
	seed: number;
	noise: NoiseRates;
}

async function runCell(cell: CellSpec, options: RunMatrixOptions): Promise<EvalCell> {
	const { goalCardId, brain, config, seed } = cell;
	const identity = { goalCardId, brainId: brain.id, tier: brain.tier, configId: config.id, seed };

	try {
		const plan = planFor(goalCardId);
		/*
		 * The tools the plan needs, unless the configuration is deliberately
		 * taking them away.
		 *
		 * Missing this was a real bug and the scorecard is what caught it: Sums
		 * ran with no Tool Belt, so its first turn was a calculator call the bot
		 * could not make — 50 % wasted ticks on a plan the solvability suite
		 * proves wastes nothing. It still scored 100 % success, because the plan
		 * says "391" in words and the card only asks that Teddy be told the right
		 * answer. So the cell was green, wrong, and measuring nothing about tool
		 * use at all.
		 */
		const tools = PLAN_TOOLS[goalCardId];
		const spec = buildSpec({
			goalCardId,
			...(tools ? { tools } : {}),
			...config.overrides
		});
		const maxTicks = config.maxTicks;

		const run = await runToCompletion({
			script:
				brain.tier === 'scripted-noisy'
					? scriptedNoisy(plan, { seed, rates: cell.noise })
					: scriptedOptimal(plan),
			spec,
			// Enough headroom that the *budget* ends a run rather than the harness
			// running out of patience — an OUT_OF_STEPS is a result, a truncated
			// loop is a measurement artefact.
			stepLimit: (maxTicks ?? 30) + 10,
			...(maxTicks !== undefined ? { maxTicks } : {}),
			...(brain.tier === 'live' ? { provider: providerForLive(brain, options) } : {})
		});

		const started = run.events.find((event) => event.type === 'run.started');
		return {
			...identity,
			...(started ? { runId: started.runId } : {}),
			metrics: scoreRun(run.events)
		};
	} catch (error) {
		return {
			...identity,
			metrics: scoreRun([]),
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

function providerForLive(brain: MatrixBrain, options: RunMatrixOptions): LLMProvider {
	const provider = options.providerFor?.(brain);
	if (!provider) {
		throw new Error(
			`the "${brain.id}" column is a live tier and no providerFor was supplied — see 13-… §8's live lane`
		);
	}
	return provider;
}
