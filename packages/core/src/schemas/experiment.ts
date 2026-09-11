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
export const experimentAxisSchema = z.enum(['guard', 'context', 'executors', 'knob', 'brain']);
export type ExperimentAxis = z.infer<typeof experimentAxisSchema>;

export const effectSideSchema = z.object({
	value: z.number(),
	n: z.number().int().nonnegative(),
	interval: z.tuple([z.number(), z.number()])
});
export type EffectSide = z.infer<typeof effectSideSchema>;

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
		wallMsPerCase: z.object({ baseline: z.number(), treatment: z.number() }).optional()
	}),
	runIds: z.array(z.string()),
	reportIds: z.array(z.string())
});
export type EffectRecord = z.infer<typeof effectRecordSchema>;

export const experimentVerdictSchema = z.enum(['supported', 'not-supported', 'inconclusive']);
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
	/** The campaign ids the design expanded to, in order — what `reportIds` refer to. */
	campaignIds: z.array(z.string()),
	effects: z.array(effectRecordSchema),
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
