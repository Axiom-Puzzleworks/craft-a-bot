import { z } from 'zod';
import { canonicalJson } from './cassette.js';
import { sha256Hex } from './sha256.js';

/**
 * **A recommendation** (plan 114 WP213; `112-REAL-ENOUGH-PLAN.md` WP186): what a decision dossier lets a bank do with a decision, as a file —
 * one of four postures, the reasons for it, what evidence would change it, and the dossier it rests on (by id and digest). It is a
 * reading of a dossier, never more than the dossier shows: a decision whose accuracy is *not shown* keeps a person on every decision,
 * whatever else is true. About this synthetic bank and one model's sample of its tier; it transfers as method and shape, never as magnitude.
 * `docs/schemas/recommendation.schema.json`.
 */
export const RECOMMENDATION_POSTURES = [
	'delegate-within-ceilings',
	'delegate-with-a-person-on-the-irreversible-step',
	'keep-a-person-on-every-decision',
	'do-not-delegate'
] as const;
export const recommendationPostureSchema = z.enum(RECOMMENDATION_POSTURES);
export type RecommendationPosture = z.infer<typeof recommendationPostureSchema>;

export const recommendationSchema = z.object({
	schemaVersion: z.literal(1),
	id: z.string().min(1),
	subject: z.string().min(1),
	decisionKind: z.string().min(1),
	model: z.string().min(1),
	posture: recommendationPostureSchema,
	/** The measures that hold the posture where it is, each with its verdict. */
	because: z.array(z.string()),
	/** What evidence would move it: the not-shown measures' own words on what would show them. */
	wouldShow: z.array(z.string()),
	dossier: z.object({
		id: z.string().min(1),
		digest: z.string().regex(/^[0-9a-f]{64}$/),
		verdict: z.enum(['fit', 'not-fit', 'not-shown'])
	}),
	caveat: z.string(),
	generatedAt: z.string().datetime(),
	digest: z.string().regex(/^[0-9a-f]{64}$/)
});
export type Recommendation = z.infer<typeof recommendationSchema>;

/** The recommendation's digest: SHA-256 over the canonical JSON of the record without its digest. */
export function recommendationDigest(recommendation: Omit<Recommendation, 'digest'>): string {
	const { ...body } = recommendation;
	delete (body as { digest?: string }).digest;
	return sha256Hex(canonicalJson(body));
}

export function parseRecommendation(value: unknown): Recommendation {
	const parsed = recommendationSchema.parse(value);
	const expected = recommendationDigest(parsed);
	if (expected !== parsed.digest)
		throw new Error(
			`recommendation ${parsed.id}: digest mismatch (${parsed.digest} ≠ ${expected})`
		);
	return parsed;
}
