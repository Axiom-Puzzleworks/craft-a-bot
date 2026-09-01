import { z } from 'zod';

/**
 * The Armour Brick's config (`25-…` §4.3). `configVersion` is not carried on
 * this schema — as with every other kind (`starter/brick-kinds.ts`), it lives
 * on the `BrickKindDefinition` the brick module adds in Stage D. This file is
 * the schema alone, so it is testable without a brick kind existing yet
 * (`25-…` §11 Stage A).
 *
 * Every dial here is additive over the local governance floor
 * (`maxTicks`/`repeatLimit`, `starter/safety`'s own two) plus the hosted
 * screen dials. `filters` overrides always win over the hook dial they sit
 * under, stricter or looser — it is the more specific rule. `csam` has no
 * override anywhere in this schema: a match is `stop-run` regardless of what
 * a panel says (`25-…` §4.3), enforced in `guardrails.ts`, not here.
 */

const dispositionSchema = z.enum(['inherit', 'off', 'note', 'block', 'ask', 'stop']);

export const armorConfigSchema = z.object({
	projectId: z.string().min(1),
	/** A Model Armor region. Unknown values warn at build time, never block (`25-…` §4.3). */
	location: z.string().min(1),
	templateId: z.string().min(1),

	screenObservation: z.enum(['off', 'note', 'stop']).default('off'),
	/** Defaults to `ask` (decision D1) — the only hook where a match can become the approval card. */
	screenDecision: z.enum(['off', 'note', 'block', 'ask', 'stop']).default('ask'),
	screenResult: z.enum(['off', 'note', 'stop']).default('off'),

	filters: z
		.object({
			injection: dispositionSchema.default('inherit'),
			harmfulContent: dispositionSchema.default('inherit'),
			sensitiveData: dispositionSchema.default('inherit'),
			maliciousLinks: dispositionSchema.default('inherit')
		})
		.default({
			injection: 'inherit',
			harmfulContent: 'inherit',
			sensitiveData: 'inherit',
			maliciousLinks: 'inherit'
		}),
	injectionMinConfidence: z
		.enum(['LOW_AND_ABOVE', 'MEDIUM_AND_ABOVE', 'HIGH'])
		.default('MEDIUM_AND_ABOVE'),

	/** What a fired-but-unreachable guard does: fail closed (the default) or allow with a note. */
	onFailure: z.enum(['stop-run', 'allow-with-note']).default('stop-run'),
	timeoutMs: z.number().int().min(500).max(10000).default(3000),

	/** The local floor (`starter/safety`'s own two dials) — never leaves the browser. */
	maxTicks: z.number().int().positive().default(30),
	repeatLimit: z.number().int().min(2).max(10).optional(),

	/** Hosted screens return a canned allow, labelled `'offline'` in the trace, no network call made. */
	offline: z.boolean().default(false)
});

export type ArmorConfig = z.infer<typeof armorConfigSchema>;
export type ArmorConfigInput = z.input<typeof armorConfigSchema>;
export type ArmorDisposition = z.infer<typeof dispositionSchema>;
