import { z } from 'zod';
import { predicateExprSchema } from './policy-card.js';

/**
 * **AssertionCard v1** (`14-…` §5.7, WP27): "Assertion cards run against
 * traces (\"bot never touched Teddy's snack\"); config: assertion list." Data,
 * versioned and shareable exactly like a `PolicyCard` — the same
 * `PredicateExpr` condition language WP22 built, reused rather than
 * reinvented, because the two questions are the same shape asked at
 * different times: a policy card asks "would this call be allowed right
 * now?", an assertion card asks "did any call in this finished run match?".
 *
 * `quantifier` is deliberately tiny, matching `PredicateExpr`'s own "OPA in
 * miniature" scope: `'never'` for the forbidden-thing cards, `'at-least-once'`
 * for the "did it actually do the good thing" cards. A third quantifier
 * (`'always'`, matching every call rather than any) is left for whenever a
 * real card needs it rather than built speculatively.
 */

export const ASSERTION_CARD_SCHEMA_VERSION = 1;

export const assertionQuantifierSchema = z.enum(['never', 'at-least-once']);
export type AssertionQuantifier = z.infer<typeof assertionQuantifierSchema>;

export const assertionCardSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	schemaVersion: z.literal(ASSERTION_CARD_SCHEMA_VERSION),
	quantifier: assertionQuantifierSchema,
	when: predicateExprSchema
});
export type AssertionCard = z.infer<typeof assertionCardSchema>;

export function parseAssertionCard(value: unknown): AssertionCard {
	return assertionCardSchema.parse(value);
}

export function safeParseAssertionCard(
	value: unknown
): ReturnType<typeof assertionCardSchema.safeParse> {
	return assertionCardSchema.safeParse(value);
}
