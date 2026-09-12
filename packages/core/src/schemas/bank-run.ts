import { z } from 'zod';
import { workItemKindSchema } from './book.js';
import { contextSpecSchema } from './context.js';

/**
 * **A day at the bank** (WP83, `71-THE-CLOCK.md` §4; `64-…` §6.5.2; tenet
 * 24): the artefact a bank run leaves — the clock's options, the desks'
 * assignments, the population digest, the counts by kind and desk, the
 * incidents, and every workflow run's id and digest in arrival order, with
 * a digest over those — so the day is reproducible from this alone. The
 * runs themselves reach the sink. `docs/schemas/bank-run.schema.json`.
 */
export const bankClockRecordSchema = z.object({
	from: z.string().min(1),
	to: z.string().min(1),
	seed: z.number().int(),
	/** Simulated seconds per wall second; `"Infinity"` as a string, since JSON has no infinity. */
	acceleration: z.union([z.number().positive(), z.literal('Infinity')]),
	rates: z
		.record(
			z.string(),
			z.object({
				profile: z.array(z.number().nonnegative()).length(24),
				scale: z.number().min(0).max(1)
			})
		)
		.optional(),
	/** The books the clock scheduled: each by kind, its population digest and how many items it held. */
	books: z.array(
		z.object({
			kind: workItemKindSchema,
			items: z.number().int().nonnegative(),
			populationDigest: z.string().optional()
		})
	)
});

export const deskAssignmentRecordSchema = z.object({
	id: z.string().min(1),
	workflowId: z.string().min(1),
	kinds: z.array(workItemKindSchema).min(1),
	configuration: z.string().optional(),
	knobs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
	context: contextSpecSchema.optional(),
	concurrency: z.number().int().positive(),
	build: z.string().min(1)
});

export const bankRunSchema = z.object({
	schemaVersion: z.literal(1),
	id: z.string().min(1),
	clock: bankClockRecordSchema,
	populationDigest: z.string().optional(),
	desks: z.array(deskAssignmentRecordSchema),
	counts: z.object({
		arrivals: z.record(z.string(), z.number().int().nonnegative()),
		routed: z.number().int().nonnegative(),
		unrouted: z.number().int().nonnegative(),
		completed: z.number().int().nonnegative(),
		stopped: z.number().int().nonnegative(),
		byDesk: z.record(
			z.string(),
			z.object({
				worked: z.number().int().nonnegative(),
				completed: z.number().int().nonnegative(),
				stopped: z.number().int().nonnegative()
			})
		)
	}),
	incidents: z.array(
		z.object({
			runId: z.string(),
			itemId: z.string(),
			desk: z.string(),
			stageId: z.string().optional(),
			status: z.string().optional(),
			finding: z.string().optional()
		})
	),
	/** Every workflow run, in arrival order: enough to check a re-run run by run. */
	runs: z.array(
		z.object({
			ordinal: z.number().int().nonnegative(),
			itemId: z.string(),
			kind: workItemKindSchema,
			desk: z.string(),
			runId: z.string(),
			digest: z.string(),
			outcome: z.enum(['completed', 'stopped', 'abandoned'])
		})
	),
	/** The clock's, never the wall's. */
	startedAt: z.string(),
	finishedAt: z.string(),
	/** Wall-clock milliseconds the day took — outside the digest, since it is the machine's. */
	wallMs: z.number().nonnegative().optional(),
	/** SHA-256 over the runs' digests in order. */
	digest: z.string().min(1)
});
export type BankRun = z.infer<typeof bankRunSchema>;

export function parseBankRun(value: unknown): BankRun {
	return bankRunSchema.parse(value);
}
