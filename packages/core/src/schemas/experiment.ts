import { z } from 'zod';
import { canonicalJson } from './cassette.js';
import { sha256Hex } from './sha256.js';

/**
 * **An experiment's result** (WP89, `72-EXPERIMENTS.md` §3; `64-…` §6.8.1;
 * decision D8; tenet 19): the effects an experiment measured — for each
 * pre-registered metric and each factor, every treatment level against the
 * baseline as a difference with its interval and *n* — and the verdict the
 * intervals give. Numbers only, so the register (`governance`, WP90) reads
 * it without the design, which lives beside the campaign schema in
 * `@craftabot/evals`. `docs/schemas/experiment-result.schema.json`.
 */
export const experimentAxisSchema = z.enum(['guard', 'context', 'executors', 'knob', 'brain', 'override']);
export type ExperimentAxis = z.infer<typeof experimentAxisSchema>;

export const effectSideSchema = z.object({
	value: z.number(),
	n: z.number().int().nonnegative(),
	interval: z.tuple([z.number(), z.number()])
});
export type EffectSide = z.infer<typeof effectSideSchema>;

/** One configuration's bill per case (WP172, `112-REAL-ENOUGH-PLAN.md` §5): what the model cost and what the people did, in one unit. */
export const billSchema = z.object({
	tokens: z.number().nonnegative(),
	modelPounds: z.number().nonnegative(),
	humanSeconds: z.number().nonnegative(),
	humanPounds: z.number().nonnegative(),
	pounds: z.number().nonnegative()
});
export type Bill = z.infer<typeof billSchema>;

/**
 * **A reliability estimate** (WP191, `113-RECORDING-AND-RELIABILITY.md` §4.7): a
 * value over items with its interval and how the interval was made. The unit
 * is the item, never the trial.
 */
export const reliabilityEstimateSchema = z.object({
	value: z.number(),
	interval: z.tuple([z.number(), z.number()]),
	method: z.string().min(1)
});
export type ReliabilityEstimate = z.infer<typeof reliabilityEstimateSchema>;

/**
 * **One campaign's reliability** (WP191): its cells grouped into items (the
 * same case, performed again), and for each binary metric pass@1, pass@k,
 * pass^k and consistency; across trials, how often the first call and the
 * first words repeated at the first tick (the prompt was identical, so the
 * difference is the model's own) and how soon, and how far, the paths forked.
 */
export const reliabilityRecordSchema = z.object({
	campaignId: z.string().min(1),
	/** Trials the design asked of each item; items with fewer than `k` are left out and counted. */
	trials: z.number().int().positive(),
	k: z.number().int().positive(),
	items: z.number().int().nonnegative(),
	skipped: z.number().int().nonnegative(),
	metrics: z.array(
		z.object({
			metricId: z.string().min(1),
			pass1: reliabilityEstimateSchema,
			passAtK: reliabilityEstimateSchema,
			passHatK: reliabilityEstimateSchema,
			consistency: reliabilityEstimateSchema
		})
	),
	firstTick: z
		.object({
			/** Pairs of trials compared, over all items. */
			pairs: z.number().int().nonnegative(),
			sameCall: reliabilityEstimateSchema,
			sameWords: reliabilityEstimateSchema
		})
		.optional(),
	divergence: z
		.object({
			/** The share of items whose trials all took the same path. */
			identicalPaths: reliabilityEstimateSchema,
			/** The median tick at which two diverging trials first differed; null when none diverged. */
			medianFirstDivergence: z.number().nullable(),
			/** The mean edit distance between two trials' action sequences, over every pair. */
			meanPathDistance: z.number().nonnegative()
		})
		.optional()
});
export type ReliabilityRecord = z.infer<typeof reliabilityRecordSchema>;

export const effectRecordSchema = z.object({
	experimentId: z.string().min(1),
	metricId: z.string().min(1),
	/** The controls under test (the experiment's own list). */
	controlIds: z.array(z.string()),
	factor: z.object({
		axis: experimentAxisSchema,
		baseline: z.string(),
		treatment: z.string()
	}),
	baseline: effectSideSchema,
	treatment: effectSideSchema,
	/** treatment − baseline. */
	delta: z.number(),
	/**
	 * The brain tier the comparison was made under (WP116, `103-FALLIBLE-ACTORS.md`
	 * §6): `scripted-noisy`, `fallible`, `live`… A design with a `brain` factor
	 * measures every other factor under each of its levels; the register names
	 * it beside every effect. Absent on a result written before WP116.
	 */
	tier: z.string().optional(),
	/**
	 * Both sides at the metric's bound with nothing to separate them (WP116,
	 * tenet 33): 100% against 100%, 0% against 0%, or a mean with no spread on
	 * either side. Says nothing about the control, and leaves the verdict.
	 */
	untestable: z.literal(true).optional(),
	interval: z.tuple([z.number(), z.number()]),
	p: z.number().min(0).max(1).optional(),
	/** How the interval and the test were made, in words. */
	method: z.string().min(1),
	underpowered: z.boolean(),
	/** The same difference within a cohort — by attribute value both sides carry. */
	slices: z
		.array(
			z.object({
				where: z.record(z.string(), z.string()),
				delta: z.number(),
				interval: z.tuple([z.number(), z.number()]),
				n: z.object({
					baseline: z.number().int().nonnegative(),
					treatment: z.number().int().nonnegative()
				})
			})
		)
		.optional(),
	cost: z.object({
		tokensPerCase: z.object({ baseline: z.number(), treatment: z.number() }),
		approvalsPerCase: z.object({ baseline: z.number(), treatment: z.number() }),
		escalationRate: z.object({ baseline: z.number(), treatment: z.number() }),
		wallMsPerCase: z.object({ baseline: z.number(), treatment: z.number() }).optional(),
		/** WP90: the workflow's account per cell — touches a person made, and the share of cells with a ceiling breach. */
		touchesPerCase: z.object({ baseline: z.number(), treatment: z.number() }).optional(),
		breachRate: z.object({ baseline: z.number(), treatment: z.number() }).optional(),
		/** WP172: the model's cost and the person's folded into one bill per case, in pounds at the stated rates; absent when the analysis was given none. */
		bill: z.object({ baseline: billSchema, treatment: billSchema }).optional()
	}),
	/**
	 * WP191: for a rate metric over cells performed more than once, each side's pass^k (every k trials of an item pass) beside
	 * the effect on the rate — a control must hold every time. Absent at one trial per item.
	 */
	reliability: z
		.object({
			k: z.number().int().positive(),
			baseline: reliabilityEstimateSchema,
			treatment: reliabilityEstimateSchema
		})
		.optional(),
	runIds: z.array(z.string()),
	reportIds: z.array(z.string())
});
export type EffectRecord = z.infer<typeof effectRecordSchema>;

/** `untestable` since WP116 (`103-…` §6): every effect sat at a bound, so no actor erred for a control to catch. */
export const experimentVerdictSchema = z.enum([
	'supported',
	'not-supported',
	'inconclusive',
	'untestable'
]);
export type ExperimentVerdict = z.infer<typeof experimentVerdictSchema>;

const resultBody = {
	schemaVersion: z.literal(1),
	/** `<experimentId>@<ranAt>`. */
	id: z.string().min(1),
	experimentId: z.string().min(1),
	title: z.string().min(1),
	hypothesis: z.string(),
	controls: z.array(z.string()),
	obligations: z.array(z.string()),
	ranAt: z.string().datetime(),
	populationDigest: z.string().optional(),
	/** The workflows the design ran (WP90): what the register's coverage counts. */
	workflowIds: z.array(z.string()).optional(),
	/** The campaign ids the design expanded to, in order — what `reportIds` refer to. */
	campaignIds: z.array(z.string()),
	effects: z.array(effectRecordSchema),
	/** WP191: each campaign's reliability over trials; absent when no cell was performed more than once. */
	reliability: z.array(reliabilityRecordSchema).optional(),
	verdict: experimentVerdictSchema,
	/** The power note and anything the analysis had to say. */
	note: z.string()
};

export const experimentResultSchema = z.object({
	...resultBody,
	/** SHA-256 over the canonical JSON of everything above. */
	digest: z.string().regex(/^[0-9a-f]{64}$/)
});
export type ExperimentResult = z.infer<typeof experimentResultSchema>;

/** The result's digest: SHA-256 over the canonical JSON of the record without its digest. */
export function experimentResultDigest(result: Omit<ExperimentResult, 'digest'>): string {
	const { ...body } = result;
	delete (body as { digest?: string }).digest;
	return sha256Hex(canonicalJson(body));
}

export function parseExperimentResult(value: unknown): ExperimentResult {
	const parsed = experimentResultSchema.parse(value);
	const expected = experimentResultDigest(parsed);
	if (expected !== parsed.digest) {
		throw new Error(
			`experiment result ${parsed.id}: digest mismatch (${parsed.digest} ≠ ${expected})`
		);
	}
	return parsed;
}

export function safeParseExperimentResult(value: unknown) {
	return experimentResultSchema.safeParse(value);
}

/** Newest first by `ranAt`, then by id — how the Experiments list reads them. */
export function byNewestExperimentResult(a: ExperimentResult, b: ExperimentResult): number {
	return b.ranAt.localeCompare(a.ranAt) || a.id.localeCompare(b.id);
}
