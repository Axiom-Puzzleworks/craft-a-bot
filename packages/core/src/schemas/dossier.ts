import { z } from 'zod';
import { canonicalJson } from './cassette.js';
import { sha256Hex } from './sha256.js';

/**
 * **A decision dossier** (plan 114 WP214, G193; `114-DECISIONS-UNDER-PRESSURE-PLAN.md` §6): one claim about a model making one kind of
 * decision, with the evidence under it — the artefact a model-risk reader would be handed. Eight measures, each a value with its
 * interval, the result it was read from, the model it rests on and a **threshold a bank would set**, and a verdict on each:
 *
 * - `met`: the evidence clears the threshold, to the end of its interval.
 * - `not-met`: the evidence is on the wrong side of the threshold, to the end of its interval.
 * - `not-shown`: the interval straddles the threshold, or there is no evidence — a ceiling at a small *n* reads this way, and says so.
 *
 * The dossier's own verdict is `fit` only when every measure is met, `not-fit` when any is not met, and `not-shown` otherwise — which is
 * what a first dossier is expected to read, and the plan says so. The thresholds are assumption rows (D8), pending review.
 * `docs/schemas/decision-dossier.schema.json`.
 */
export const DOSSIER_MEASURES = [
	'accuracy',
	'reliability',
	'robustness',
	'faithfulness',
	'fairness',
	'oversight',
	'cost',
	'harm'
] as const;
export const dossierMeasureIdSchema = z.enum(DOSSIER_MEASURES);
export type DossierMeasureId = z.infer<typeof dossierMeasureIdSchema>;

export const dossierVerdictSchema = z.enum(['met', 'not-met', 'not-shown']);
export type DossierVerdict = z.infer<typeof dossierVerdictSchema>;

export const dossierMeasureSchema = z.object({
	id: dossierMeasureIdSchema,
	/** What was measured, in words. */
	label: z.string().min(1),
	value: z.number().optional(),
	interval: z.tuple([z.number(), z.number()]).optional(),
	/** The items (or cases) the value is over. */
	n: z.number().int().nonnegative().optional(),
	unit: z.enum(['rate', 'pounds', 'difference']),
	threshold: z.object({ kind: z.enum(['at-least', 'at-most']), value: z.number() }),
	verdict: dossierVerdictSchema,
	/** The committed result the figure was read from, and which metric of it. */
	source: z
		.object({
			resultId: z.string().min(1),
			experimentId: z.string().min(1),
			metricId: z.string().min(1),
			tier: z.string().optional()
		})
		.optional(),
	/** Why the verdict reads as it does — and, for `not-shown`, what would show it. */
	note: z.string()
});
export type DossierMeasure = z.infer<typeof dossierMeasureSchema>;

export const decisionDossierSchema = z.object({
	schemaVersion: z.literal(1),
	id: z.string().min(1),
	/** The journey (workflow) or design the decision belongs to. */
	subject: z.string().min(1),
	/** The decision kind the thresholds are stated for (D8). */
	decisionKind: z.string().min(1),
	/** The model the figures rest on: a sample of its tier, never a ranking. */
	model: z.string().min(1),
	recordedOn: z.string().optional(),
	generatedAt: z.string().datetime(),
	measures: z.array(dossierMeasureSchema).length(DOSSIER_MEASURES.length),
	verdict: z.enum(['fit', 'not-fit', 'not-shown']),
	/** The one-line reading of the verdict: which measures hold it back. */
	summary: z.string(),
	digest: z.string().regex(/^[0-9a-f]{64}$/)
});
export type DecisionDossier = z.infer<typeof decisionDossierSchema>;

/** The dossier's digest: SHA-256 over the canonical JSON of the record without its digest. */
export function decisionDossierDigest(dossier: Omit<DecisionDossier, 'digest'>): string {
	const { ...body } = dossier;
	delete (body as { digest?: string }).digest;
	return sha256Hex(canonicalJson(body));
}

export function parseDecisionDossier(value: unknown): DecisionDossier {
	const parsed = decisionDossierSchema.parse(value);
	const expected = decisionDossierDigest(parsed);
	if (expected !== parsed.digest)
		throw new Error(
			`decision dossier ${parsed.id}: digest mismatch (${parsed.digest} ≠ ${expected})`
		);
	return parsed;
}
