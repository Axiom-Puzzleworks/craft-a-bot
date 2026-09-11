import { z } from 'zod';
import type { ContextSpec } from '../types/context.js';

/** `ContextSpec` as data (WP81, `70-…` §3): what a campaign file and a workflow configuration carry. */
export const contextLevelSchema = z.enum(['minimal', 'case-file', 'relational', 'ontology']);
export const contextDeliverySchema = z.enum(['brief', 'sense', 'line']);

export const contextSpecSchema = z.object({
	id: z.string().min(1),
	level: contextLevelSchema,
	include: z.array(z.string().min(1)).optional(),
	exclude: z.array(z.string().min(1)).optional(),
	ontology: z
		.object({
			scope: z.enum(['customer', 'bank']),
			depth: z.number().int().min(0).max(4),
			relations: z.array(z.string().min(1)).optional()
		})
		.optional(),
	delivery: z.array(contextDeliverySchema).min(1).default(['sense']),
	budgetTokens: z.number().int().positive().optional()
});

/** A `ContextSpec` out of what a host handed over, or a throw that says what was wrong. */
export function parseContextSpec(value: unknown): ContextSpec {
	const parsed = contextSpecSchema.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`context: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`
		);
	}
	return parsed.data as ContextSpec;
}
