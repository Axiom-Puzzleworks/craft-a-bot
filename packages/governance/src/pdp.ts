import type { GuardrailContext } from '@craftabot/core';
import { z } from 'zod';

/**
 * **The policy decision point's input document** (`33-POLICY-V2-PDP.md`
 * §4.3, WP45; `26-…` §6.4): a stable JSON shape an external PDP — OPA,
 * Cedar, a vendor — evaluates. Spec identity, the proposed call, usage, and
 * every world predicate the world declares, answered now. Built once here,
 * attached by the shell to every `ScreenRequest` as `policyInput`, so a
 * PDP pack never needs the context and every PDP sees the same document.
 */

export const PDP_INPUT_VERSION = 1;

/** The policy decision point's input document (`33-…` §4.3): agent identity, the proposed call, usage, the hook and tick, and the world's predicates. */
export const pdpInputSchema = z.object({
	version: z.literal(PDP_INPUT_VERSION),
	hook: z.enum(['pre-think', 'pre-act', 'post-act']),
	tick: z.number().int().nonnegative(),
	agent: z.object({
		id: z.string(),
		name: z.string(),
		goalCardId: z.string()
	}),
	proposed: z
		.object({ kind: z.enum(['tool', 'action']), name: z.string(), arguments: z.unknown() })
		.optional(),
	usage: z.object({
		ticks: z.number(),
		inputTokens: z.number(),
		outputTokens: z.number()
	}),
	world: z.object({ predicates: z.record(z.string(), z.boolean()) })
});
/** A parsed PDP input document. */
export type PdpInput = z.infer<typeof pdpInputSchema>;

/** Builds the PDP input document from a `GuardrailContext`. */
export function pdpRequestFor(ctx: GuardrailContext): PdpInput {
	const predicates: Record<string, boolean> = {};
	for (const id of ctx.world?.predicates ?? []) predicates[id] = ctx.world?.test(id) === true;
	return {
		version: PDP_INPUT_VERSION,
		hook: ctx.hook,
		tick: ctx.tick,
		agent: { id: ctx.spec.id, name: ctx.spec.name, goalCardId: ctx.spec.goalCardId },
		...(ctx.proposed
			? {
					proposed: {
						kind: ctx.proposed.kind,
						name: ctx.proposed.name,
						arguments: ctx.proposed.arguments
					}
				}
			: {}),
		usage: { ...ctx.usage },
		world: { predicates }
	};
}
