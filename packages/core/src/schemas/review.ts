import { z } from 'zod';
import type { ControlReview } from './control-review.js';
import { principalSchema, type Principal } from './shared.js';

/**
 * **A reading** (WP129, `108-READINGS.md` §2; `100-…` §6.8, D21): a
 * reader's verdict on one thing a pack ships pending — a catalogue entry, a
 * calibration row, a control row, a decision right, a blueprint item, a
 * screening list, an error model or a reviewer model — as a record beside it
 * and never an edit to it. A subject is *reviewed* when a review names it
 * with `accepted` or `amended`; `rejected` keeps it pending. An `amended`
 * review carries the field and the value the reader would put, which a
 * maintainer then edits into the content. A content kind
 * (`local/reviews/<kind>--<subject>`), generalising `control-review` (kept as
 * an alias: `reviewsFromContent`).
 */
export const REVIEW_SUBJECT_KINDS = [
	'catalogue-entry',
	'calibration-row',
	'control-row',
	'decision-right',
	'blueprint-item',
	'screening-list',
	'error-model',
	'reviewer-model',
	// WP147 (`110-…` §10): a knob set away from its default by a shipped campaign or experiment, read like a calibration row.
	'knob-change'
] as const;
export const reviewSubjectKindSchema = z.enum(REVIEW_SUBJECT_KINDS);
export type ReviewSubjectKind = z.infer<typeof reviewSubjectKindSchema>;

export const reviewVerdictSchema = z.enum(['accepted', 'amended', 'rejected']);
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

export const reviewSubjectSchema = z.object({
	kind: reviewSubjectKindSchema,
	/** `108-…` §3: the entry's id, `<table>#<row>`, `<map>#<ref>`, `<domain>#<kind>`, `<note>#<item>`, `<pack>/screening#<list>`, the model's id. */
	id: z.string().min(1)
});
export type ReviewSubject = z.infer<typeof reviewSubjectSchema>;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const jsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonSchema),
		z.record(z.string(), jsonSchema)
	])
);

export const reviewSchema = z
	.object({
		id: z.string().min(1),
		subject: reviewSubjectSchema,
		verdict: reviewVerdictSchema,
		note: z.string().optional(),
		/** The reader, as the host names them (`55-PRINCIPAL.md`): never a secret. */
		by: principalSchema,
		/** ISO 8601. */
		on: z.string().datetime(),
		/** On `amended` only: the field and the value the reader would put. */
		amendment: z.object({ field: z.string().min(1), value: jsonSchema }).optional(),
		schemaVersion: z.literal(1)
	})
	.superRefine((review, ctx) => {
		if (review.verdict === 'amended' && !review.amendment)
			ctx.addIssue({
				code: 'custom',
				path: ['amendment'],
				message: 'an amended review names the field and the value'
			});
		if (review.verdict !== 'amended' && review.amendment)
			ctx.addIssue({
				code: 'custom',
				path: ['amendment'],
				message: 'only an amended review carries an amendment'
			});
		if (review.verdict === 'rejected' && !review.note?.trim())
			ctx.addIssue({ code: 'custom', path: ['note'], message: 'a rejection says why' });
	});
export type Review = z.infer<typeof reviewSchema>;

/** The review's local slug: one per subject, so a second reading replaces the first. */
export function reviewSlug(subject: ReviewSubject): string {
	return `${subject.kind}--${subject.id}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** A subject's key in a map: `<kind> <id>`. */
export function reviewSubjectKey(subject: ReviewSubject): string {
	return `${subject.kind} ${subject.id}`;
}

/**
 * The latest review per subject: where two name one subject (a `review`
 * and an older `control-review`, say), the later `on` wins.
 */
export function latestReviews(reviews: readonly Review[]): Map<string, Review> {
	const latest = new Map<string, Review>();
	for (const review of reviews) {
		const key = reviewSubjectKey(review.subject);
		const held = latest.get(key);
		if (!held || held.on <= review.on) latest.set(key, review);
	}
	return latest;
}

/** Reviewed: the latest review naming the subject says `accepted` or `amended` (`108-…` §2). */
export function isReviewed(
	reviews: readonly Review[] | ReadonlyMap<string, Review> | undefined,
	subject: ReviewSubject
): boolean {
	if (!reviews) return false;
	const latest = reviews instanceof Map ? reviews : latestReviews(reviews as readonly Review[]);
	const review = latest.get(reviewSubjectKey(subject));
	return review !== undefined && review.verdict !== 'rejected';
}

/**
 * **The alias** (`108-…` §7): a WP110 `control-review` read as a `review` of
 * `control-row` `<mapId>#<ref>` — `reviewed` is `accepted`, `disputed` is
 * `rejected`, `by` a person, `reviewedAt` the `on`.
 */
export function reviewFromControlReview(review: ControlReview): Review {
	const by: Principal = { kind: 'person', id: review.by };
	return {
		id: review.id,
		subject: { kind: 'control-row', id: `${review.mapId}#${review.ref}` },
		verdict: review.status === 'reviewed' ? 'accepted' : 'rejected',
		...(review.note.trim() !== ''
			? { note: review.note }
			: review.status === 'disputed'
				? { note: 'disputed' }
				: {}),
		by,
		on: review.reviewedAt,
		schemaVersion: 1
	};
}
