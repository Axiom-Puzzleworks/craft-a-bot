import {
	CONTENT_SCHEMA_VERSION,
	REVIEW_SUBJECT_KINDS,
	localContentId,
	reviewSchema,
	reviewSlug,
	type ContentRecord,
	type PackManifest,
	type Principal,
	type Review,
	type ReviewSubject,
	type ReviewSubjectKind,
	type ReviewVerdict
} from '@craftabot/core';
import { GUARDRAIL_CATALOGUE } from '@craftabot/governance';
import {
	readingSourcesFrom,
	type ReadingBlueprintNote,
	type ReadingItem,
	type ReadingSources,
	type ReadingState
} from '@craftabot/governance/reports';
import { SCREENING_READINGS } from '@craftabot/pack-fs-bank';

/**
 * **The reading desk's host side** (WP129, `108-READINGS.md` §6): the sources
 * the Workbench hands the fold (the installed packs, the catalogue, the three
 * blueprint notes, the bank's screening lists), a reading as a `review` record
 * in the content store, and the queue's filter as it sits in the URL.
 */
/**
 * The sources the Workbench hands the fold. The blueprint notes come from
 * `blueprint-notes.ts`, loaded by the readings page on its own: they are 31 kB
 * of text no other screen needs.
 */
export function readingSources(
	packs: readonly PackManifest[],
	blueprints: readonly ReadingBlueprintNote[] = []
): ReadingSources {
	return readingSourcesFrom(packs, {
		catalogue: GUARDRAIL_CATALOGUE,
		blueprints,
		screeningLists: SCREENING_READINGS
	});
}

/** An amendment's value as typed: JSON where it parses (`0.18`, `true`, `["a"]`), the text otherwise. */
type AmendmentValue = NonNullable<Review['amendment']>['value'];
export function amendmentValue(text: string): AmendmentValue {
	const trimmed = text.trim();
	try {
		return JSON.parse(trimmed) as AmendmentValue;
	} catch {
		return trimmed;
	}
}

/** A reading, validated: one per subject, so a second replaces the first. */
export function reviewFor(
	subject: ReviewSubject,
	verdict: ReviewVerdict,
	by: Principal,
	on: string,
	options: { note?: string; field?: string; value?: string } = {}
): Review {
	const note = options.note?.trim();
	return reviewSchema.parse({
		id: localContentId('review', reviewSlug(subject)),
		subject,
		verdict,
		...(note ? { note } : {}),
		by,
		on,
		...(verdict === 'amended'
			? {
					amendment: {
						field: options.field?.trim() ?? '',
						value: amendmentValue(options.value ?? '')
					}
				}
			: {}),
		schemaVersion: 1
	});
}

export function reviewRecord(review: Review): ContentRecord {
	return {
		id: review.id,
		kind: 'review',
		title: `${review.subject.id}: ${review.verdict}`,
		record: review,
		savedAt: review.on,
		schemaVersion: CONTENT_SCHEMA_VERSION
	};
}

/** `open` is unread or rejected: the pending set the checks raise. */
export type ReadingFilterState = ReadingState | 'open' | 'all';

export interface ReadingFilter {
	kind?: ReviewSubjectKind;
	state: ReadingFilterState;
}

const STATES: readonly ReadingFilterState[] = [
	'open',
	'unread',
	'accepted',
	'amended',
	'rejected',
	'all'
];

/** The filter from the URL: `?kind=calibration-row&state=unread`; anything unknown reads as the default (open, every kind). */
export function readingFilterFrom(params: URLSearchParams): ReadingFilter {
	const kind = params.get('kind');
	const state = params.get('state');
	return {
		...((REVIEW_SUBJECT_KINDS as readonly string[]).includes(kind ?? '')
			? { kind: kind as ReviewSubjectKind }
			: {}),
		state: (STATES as readonly string[]).includes(state ?? '')
			? (state as ReadingFilterState)
			: 'open'
	};
}

export function readingFilterQuery(filter: ReadingFilter): string {
	const params = new URLSearchParams();
	if (filter.kind) params.set('kind', filter.kind);
	if (filter.state !== 'open') params.set('state', filter.state);
	const query = params.toString();
	return query === '' ? '' : `?${query}`;
}

export function filterQueue(queue: readonly ReadingItem[], filter: ReadingFilter): ReadingItem[] {
	return queue.filter(
		(item) =>
			(!filter.kind || item.subject.kind === filter.kind) &&
			(filter.state === 'all' ||
				(filter.state === 'open'
					? item.state === 'unread' || item.state === 'rejected'
					: item.state === filter.state))
	);
}

/** A reading's words on the row: *accepted by Andrew, 30 Sep*. */
export function readingWord(item: ReadingItem): string {
	if (!item.review) return 'unread';
	const who = item.review.by.name ?? 'a reader';
	const when = item.review.on.slice(0, 10);
	if (item.review.verdict === 'amended' && item.review.amendment)
		return `amended by ${who} (${when}): ${item.review.amendment.field} → ${JSON.stringify(item.review.amendment.value)} — awaiting the edit`;
	return `${item.review.verdict} by ${who} (${when})${item.review.note ? ` — ${item.review.note}` : ''}`;
}
