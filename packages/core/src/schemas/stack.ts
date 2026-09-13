import { z } from 'zod';
import { POINT_KINDS } from '../types/guardrail-component.js';
import { principalSchema } from './shared.js';

/**
 * **A stack as content** (WP97, `89-STACKS.md`; `83-…` §6.2.5): a named
 * list of component fits with the points they decide at, an optional
 * chokepoint half (the group Watchbot's rules and the evaluator breakers, as
 * a campaign guard's `group` names them), what it claims to serve, and who
 * wrote it. A pack ships stacks on `PackManifest.stacks`; the content store
 * keeps a user's; a campaign guard, a workflow configuration and an
 * experiment's `guard` factor name one by id. `docs/schemas/stack.schema.json`.
 */
export const guardPointSchema = z.object({
	kind: z.enum(POINT_KINDS as [string, ...string[]]),
	/** A stage id for `stage-in`/`stage-out` — absent, every stage; a host pattern for `egress`. */
	at: z.string().min(1).optional()
});
export type GuardPointRecord = z.infer<typeof guardPointSchema>;

export const stackFitSchema = z.object({
	componentId: z.string().min(1),
	config: z.unknown().optional(),
	point: guardPointSchema
});
export type StackFit = z.infer<typeof stackFitSchema>;

/** The chokepoint half — the same shape a campaign guard's `group` has (`56-…` §4.3). */
export const stackGroupSchema = z.object({
	watchFor: z.array(z.string().min(1)).default([]),
	refusalLimit: z.number().int().positive().optional(),
	breakOn: z
		.array(
			z.object({
				evaluatorId: z.string().min(1),
				labels: z.array(z.string().min(1)).optional(),
				onFail: z.boolean().optional()
			})
		)
		.default([])
});
export type StackGroup = z.infer<typeof stackGroupSchema>;

export const stackSchema = z.object({
	schemaVersion: z.literal(1),
	/** Qualified like every content id: `{packId}/stack/{slug}`, or `local/stacks/{slug}`. */
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().min(1),
	fit: z.array(stackFitSchema),
	group: stackGroupSchema.optional(),
	/** The obligation tags the stack claims to serve (`48-…` §5). */
	obligations: z.array(z.string().min(1)).optional(),
	/** The control-map row ids it claims to implement — the register's join key (`80-…`). */
	controls: z.array(z.string().min(1)).optional(),
	provenance: z.object({
		author: principalSchema,
		createdAt: z.string().datetime(),
		/** The stack this one was derived from, when it was. */
		derivedFrom: z.string().min(1).optional()
	})
});
export type Stack = z.infer<typeof stackSchema>;
