import { z } from 'zod';
import { guardrailHookSchema } from './shared.js';
import type { GuardrailHook } from './shared.js';

/**
 * **PolicyCard v1** (`14-…` §4.6, WP22): "a `PolicyCard` is data … compiled …
 * into ordinary guardrails." Registered pack content, exactly like a
 * `GoalCardDefinition` — versioned, shareable, qualified `{packId}/{localId}`
 * like every other content id (E6).
 *
 * `PredicateExpr` is deliberately tiny — "OPA in miniature" (`14-…` §4.6):
 * match on call kind/name, argument literals, and simple usage comparisons,
 * composed with and/or/not. It evaluates against exactly what a
 * `GuardrailContext` already carries (`proposed`, `usage`) — nothing here can
 * reach world state or history, which is what keeps a card auditable by
 * *reading* it rather than by running it.
 */

export const POLICY_CARD_SCHEMA_VERSION = 1;

const usageFieldSchema = z.enum(['ticks', 'inputTokens', 'outputTokens']);
const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export interface PredicateExprCallKindIs {
	kind: 'call-kind-is';
	value: 'tool' | 'action';
}
export interface PredicateExprCallNameIs {
	kind: 'call-name-is';
	/** The call's own name, e.g. `"give"` — the same short form a blocklist names (E6). */
	value: string;
}
export interface PredicateExprArgumentEquals {
	kind: 'argument-equals';
	/** A dot path into the proposed call's arguments, e.g. `"character"`. */
	path: string;
	value: string | number | boolean | null;
}
export interface PredicateExprUsageAtLeast {
	kind: 'usage-at-least';
	field: 'ticks' | 'inputTokens' | 'outputTokens';
	value: number;
}
/**
 * The six v2 leaves (WP45, `33-POLICY-V2-PDP.md` §4.1): additive under the
 * same discriminator, so every v1 card is a valid v2 card.
 */
export interface PredicateExprArgumentContains {
	kind: 'argument-contains';
	path: string;
	value: string;
}
export interface PredicateExprArgumentMatches {
	kind: 'argument-matches';
	path: string;
	/** The bounded subset `isSafePattern` accepts — no groups, no backreferences, at most 200 characters. */
	pattern: string;
}
export interface PredicateExprObservationContains {
	kind: 'observation-contains';
	value: string;
}
export interface PredicateExprWorldPredicate {
	kind: 'world-predicate';
	predicateId: string;
}
export interface PredicateExprHistoryCount {
	kind: 'history-count';
	type: string;
	name?: string | undefined;
	atLeast: number;
}
export interface PredicateExprHookIs {
	kind: 'hook-is';
	hook: GuardrailHook;
}
export interface PredicateExprAnd {
	kind: 'and';
	all: PredicateExpr[];
}
export interface PredicateExprOr {
	kind: 'or';
	any: PredicateExpr[];
}
export interface PredicateExprNot {
	kind: 'not';
	expr: PredicateExpr;
}

export type PredicateExpr =
	| PredicateExprCallKindIs
	| PredicateExprCallNameIs
	| PredicateExprArgumentEquals
	| PredicateExprUsageAtLeast
	| PredicateExprArgumentContains
	| PredicateExprArgumentMatches
	| PredicateExprObservationContains
	| PredicateExprWorldPredicate
	| PredicateExprHistoryCount
	| PredicateExprHookIs
	| PredicateExprAnd
	| PredicateExprOr
	| PredicateExprNot;

export const SAFE_PATTERN_MAX_LENGTH = 200;

/**
 * Why a pattern is refused, or `undefined` when it is safe (WP45, `33-…`
 * §4.1). The subset rules out what makes a regular expression hang a loop:
 * groups (so no nested quantifiers), backreferences, and unbounded length.
 */
export function describeUnsafePattern(pattern: string): string | undefined {
	if (pattern.length === 0) return 'a pattern cannot be empty';
	if (pattern.length > SAFE_PATTERN_MAX_LENGTH) {
		return `a pattern is at most ${SAFE_PATTERN_MAX_LENGTH} characters`;
	}
	if (/[(){}]/.test(pattern)) return 'a pattern may not use groups or braces — ( ) { }';
	if (/\\\d/.test(pattern)) return 'a pattern may not use backreferences';
	try {
		new RegExp(pattern);
	} catch {
		return 'a pattern must be a valid regular expression';
	}
	return undefined;
}

export function isSafePattern(pattern: string): boolean {
	return describeUnsafePattern(pattern) === undefined;
}

export const predicateExprSchema: z.ZodType<PredicateExpr> = z.lazy(() =>
	z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('call-kind-is'), value: z.enum(['tool', 'action']) }),
		z.object({ kind: z.literal('call-name-is'), value: z.string().min(1) }),
		z.object({ kind: z.literal('argument-equals'), path: z.string().min(1), value: literalSchema }),
		z.object({
			kind: z.literal('usage-at-least'),
			field: usageFieldSchema,
			value: z.number().int().nonnegative()
		}),
		z.object({
			kind: z.literal('argument-contains'),
			path: z.string().min(1),
			value: z.string().min(1)
		}),
		z.object({
			kind: z.literal('argument-matches'),
			path: z.string().min(1),
			pattern: z.string().refine((pattern) => isSafePattern(pattern), {
				error: (issue) => describeUnsafePattern(String(issue.input)) ?? 'unsafe pattern'
			})
		}),
		z.object({ kind: z.literal('observation-contains'), value: z.string().min(1) }),
		z.object({ kind: z.literal('world-predicate'), predicateId: z.string().min(1) }),
		z.object({
			kind: z.literal('history-count'),
			type: z.string().min(1),
			name: z.string().min(1).optional(),
			atLeast: z.number().int().positive()
		}),
		z.object({ kind: z.literal('hook-is'), hook: guardrailHookSchema }),
		z.object({ kind: z.literal('and'), all: z.array(predicateExprSchema).min(1) }),
		z.object({ kind: z.literal('or'), any: z.array(predicateExprSchema).min(1) }),
		z.object({ kind: z.literal('not'), expr: predicateExprSchema })
	])
);

export const policyDispositionSchema = z.enum(['block-action', 'stop-run', 'require-approval']);
export type PolicyDisposition = z.infer<typeof policyDispositionSchema>;

export const policyRuleSchema = z.object({
	hook: guardrailHookSchema,
	when: predicateExprSchema,
	then: policyDispositionSchema,
	reason: z.string().min(1)
});
export type PolicyRule = z.infer<typeof policyRuleSchema>;

export const policyCardSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	schemaVersion: z.literal(POLICY_CARD_SCHEMA_VERSION),
	rules: z.array(policyRuleSchema).min(1)
});
export type PolicyCard = z.infer<typeof policyCardSchema>;

export function parsePolicyCard(value: unknown): PolicyCard {
	return policyCardSchema.parse(value);
}

export function safeParsePolicyCard(value: unknown): ReturnType<typeof policyCardSchema.safeParse> {
	return policyCardSchema.safeParse(value);
}
