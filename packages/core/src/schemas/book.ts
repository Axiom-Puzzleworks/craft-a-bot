import { z } from 'zod';

/**
 * **A book of work items** (WP75, `67-PERFORMANCE-AND-BOOKS.md` §6; `64-…`
 * §6.1.3): what a batch run consumes and what the clock emits one at a
 * time — an application, an alert, a complaint, an advice request — each
 * with the truth a desk would compute for it, so evaluators need nothing
 * else. Declared in `core` because the harness, the Workshop and the
 * evidence store carry it as a file (`docs/schemas/book.schema.json`);
 * the generators that make one are `fs-bank`'s.
 */
export const workItemKindSchema = z.enum([
	'application',
	'alert',
	'complaint',
	'advice-request',
	// WP103 (`95-FS-ONBOARDING.md`): an account application.
	'onboarding',
	// WP104: a disputed payment.
	'dispute'
]);
export type WorkItemKind = z.infer<typeof workItemKindSchema>;

/** The truth a desk holds beside its state (`45-…` §4.2), as data. */
export const workItemTruthSchema = z.object({
	records: z.array(
		z.object({
			id: z.string(),
			kind: z.string(),
			title: z.string(),
			classification: z.string().optional(),
			fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
		})
	),
	facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
	cohort: z.record(z.string(), z.string()).optional()
});

export const workItemSchema = z.object({
	id: z.string().min(1),
	kind: workItemKindSchema,
	customerId: z.string().min(1),
	/** ISO datetime on the population's calendar. */
	arrivedAt: z.string().min(1),
	payload: z.unknown(),
	truth: workItemTruthSchema
});
export type WorkItem = z.infer<typeof workItemSchema>;

export const bookSourceSchema = z.object({
	populationDigest: z.string().min(1),
	seed: z.number().int(),
	size: z.number().int().positive(),
	filter: z.unknown().optional(),
	/** The factor by which an incidence was raised so a book has enough positives (`66-…` §2, `fraud-incidence`). */
	oversample: z.number().positive().optional()
});
export type BookSource = z.infer<typeof bookSourceSchema>;

export const bookSchema = z.object({
	schemaVersion: z.literal(1),
	kind: workItemKindSchema,
	items: z.array(workItemSchema),
	source: bookSourceSchema
});
export type Book = z.infer<typeof bookSchema>;

export function parseBook(value: unknown): Book {
	return bookSchema.parse(value);
}
