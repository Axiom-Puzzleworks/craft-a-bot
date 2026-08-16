import { z } from 'zod';
import { guardrailHookSchema } from './shared.js';

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
	| PredicateExprAnd
	| PredicateExprOr
	| PredicateExprNot;

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
