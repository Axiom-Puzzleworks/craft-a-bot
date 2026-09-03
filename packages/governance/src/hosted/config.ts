import { findingCategorySchema } from '@craftabot/core';
import { z } from 'zod';

/**
 * **The screening dials every hosted guard shares** (`29-GUARD-SHELL.md`
 * §4.4, WP39 stage C) — the Armour Brick's own dials (`25-…` §4.3) with the
 * vendor's filter names replaced by `FindingCategory`. A vendor's brick keeps
 * whatever config shape its users saved and maps it onto this at
 * `createRuntime`; the generic Guard brick stores this shape directly.
 *
 * `screenObservation`/`screenResult` keep the narrower `off|note|stop`: the
 * per-hook clamp (`verdict.ts`) makes `block`/`ask` meaningless there, and
 * a dial that offered them would be lying about what it can do (`29-…` §8
 * D-g).
 */

export const dispositionSchema = z.enum(['off', 'note', 'block', 'ask', 'stop']);
/** One of `dispositionSchema`'s values. */
export type Disposition = z.infer<typeof dispositionSchema>;

/** A per-category override of the default disposition, or `'inherit'`. */
export const categoryDispositionSchema = z.enum(['inherit', ...dispositionSchema.options]);
/** One of `categoryDispositionSchema`'s values. */
export type CategoryDisposition = z.infer<typeof categoryDispositionSchema>;

/** The screening dials of a hosted guard: which hooks screen, the default disposition, per-category overrides, what a failed call does, and the timeout. */
export const hostedScreenConfigSchema = z.object({
	screenObservation: z.enum(['off', 'note', 'stop']).default('off'),
	/** Defaults to `ask` (`25-…` D1) — the only hook where a match can become the approval card. */
	screenDecision: dispositionSchema.default('ask'),
	screenResult: z.enum(['off', 'note', 'stop']).default('off'),
	/** A per-category override always wins over the hook dial it sits under, stricter or looser — it is the more specific rule. */
	perCategory: z.partialRecord(findingCategorySchema, categoryDispositionSchema).default({}),
	/** A finding below this confidence is not counted; a finding with no confidence always is. */
	minConfidence: z.enum(['low', 'medium', 'high']).default('medium'),
	/** What a fired-but-unreachable guard does: fail closed (the default) or allow with a note. */
	onFailure: z.enum(['stop-run', 'allow-with-note']).default('stop-run'),
	timeoutMs: z.number().int().min(500).max(10000).default(3000),
	/** The canned client: no key, no network, `outcome: 'offline'` on the trace. */
	offline: z.boolean().default(false)
});
/** A parsed screening config, defaults applied. */
export type HostedScreenConfig = z.infer<typeof hostedScreenConfigSchema>;
/** A screening config as authored, before defaults. */
export type HostedScreenConfigInput = z.input<typeof hostedScreenConfigSchema>;
