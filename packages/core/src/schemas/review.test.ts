import { describe, expect, it } from 'vitest';
import {
	CONTENT_SCHEMA_VERSION,
	localContentId,
	localPackFrom,
	parseContentRecord,
	reviewsFromContent
} from './content.js';
import { controlReviewSlug, type ControlReview } from './control-review.js';
import { computeEvidenceDigest, parseEvidenceItem } from './evidence.js';
import {
	isReviewed,
	latestReviews,
	reviewSchema,
	reviewSlug,
	type Review,
	type ReviewSubject
} from './review.js';

const ANDREW = { kind: 'person' as const, id: 'andrew' };
const ROW: ReviewSubject = { kind: 'calibration-row', id: 'fs-bank/calibration#age-band' };

function review(overrides: Partial<Review> = {}): Review {
	const subject = overrides.subject ?? ROW;
	return reviewSchema.parse({
		id: localContentId('review', reviewSlug(subject)),
		subject,
		verdict: 'accepted',
		by: ANDREW,
		on: '2026-09-30T10:00:00.000Z',
		schemaVersion: 1,
		...overrides
	});
}

describe('a reading (WP129, 108-READINGS.md §2)', () => {
	it('slugs one id per subject, so a second reading replaces the first', () => {
		expect(reviewSlug(ROW)).toBe('calibration-row-fs-bank-calibration-age-band');
		expect(localContentId('review', reviewSlug(ROW))).toBe(
			'local/reviews/calibration-row-fs-bank-calibration-age-band'
		);
	});

	it('asks an amendment of an amended review, of no other, and a note of a rejection', () => {
		const base = {
			id: 'x',
			subject: ROW,
			by: ANDREW,
			on: '2026-09-30T10:00:00.000Z',
			schemaVersion: 1
		};
		expect(reviewSchema.safeParse({ ...base, verdict: 'amended' }).success).toBe(false);
		expect(
			reviewSchema.safeParse({
				...base,
				verdict: 'amended',
				amendment: { field: 'distribution.25-34', value: 0.18 }
			}).success
		).toBe(true);
		expect(
			reviewSchema.safeParse({
				...base,
				verdict: 'accepted',
				amendment: { field: 'title', value: 'x' }
			}).success
		).toBe(false);
		expect(reviewSchema.safeParse({ ...base, verdict: 'rejected' }).success).toBe(false);
		expect(
			reviewSchema.safeParse({ ...base, verdict: 'rejected', note: 'The source says 12%.' }).success
		).toBe(true);
	});

	it('is reviewed on accepted or amended, pending on rejected, and the latest reading wins', () => {
		expect(isReviewed(undefined, ROW)).toBe(false);
		expect(isReviewed([review()], ROW)).toBe(true);
		expect(
			isReviewed(
				[review({ verdict: 'amended', amendment: { field: 'tolerance', value: 0.02 } })],
				ROW
			)
		).toBe(true);
		expect(isReviewed([review({ verdict: 'rejected', note: 'wrong table' })], ROW)).toBe(false);
		expect(
			isReviewed([review()], { kind: 'calibration-row', id: 'fs-bank/calibration#other' })
		).toBe(false);
		const later = review({
			verdict: 'rejected',
			note: 'on second reading',
			on: '2026-10-01T09:00:00.000Z'
		});
		expect(isReviewed([later, review()], ROW)).toBe(false);
		expect(isReviewed(latestReviews([review(), later]), ROW)).toBe(false);
	});
});

describe('the review content kind, and control-review as its alias (108-…§7)', () => {
	const controlReview: ControlReview = {
		id: localContentId(
			'control-review',
			controlReviewSlug('fs-bank/control-map', 'products-services')
		),
		mapId: 'fs-bank/control-map',
		ref: 'products-services',
		status: 'disputed',
		by: 'Andrew',
		note: 'The evidence names the wrong card.',
		reviewedAt: '2026-09-13T10:00:00.000Z',
		schemaVersion: 1
	};

	it('validates under local/reviews/, and never enters the local pack', () => {
		const record = parseContentRecord({
			id: review().id,
			kind: 'review',
			title: 'fs-bank/calibration#age-band: accepted',
			record: review(),
			savedAt: '2026-09-30T10:00:00.000Z',
			schemaVersion: CONTENT_SCHEMA_VERSION
		});
		expect(localPackFrom([record])).not.toHaveProperty('reviews');
		expect(Object.keys(localPackFrom([record]))).toEqual(['id', 'name', 'version', 'requiresCore']);
		expect(() =>
			parseContentRecord({ ...record, record: { ...review(), verdict: 'maybe' } })
		).toThrow();
	});

	it('reads a control-review as a review of its control row', () => {
		const records = [
			parseContentRecord({
				id: controlReview.id,
				kind: 'control-review',
				title: 'products-services: disputed',
				record: controlReview,
				savedAt: controlReview.reviewedAt,
				schemaVersion: CONTENT_SCHEMA_VERSION
			}),
			parseContentRecord({
				id: review().id,
				kind: 'review',
				title: 'age-band: accepted',
				record: review(),
				savedAt: '2026-09-30T10:00:00.000Z',
				schemaVersion: CONTENT_SCHEMA_VERSION
			})
		];
		const reviews = reviewsFromContent(records);
		expect(reviews[0]).toEqual({
			id: controlReview.id,
			subject: { kind: 'control-row', id: 'fs-bank/control-map#products-services' },
			verdict: 'rejected',
			note: 'The evidence names the wrong card.',
			by: { kind: 'person', id: 'Andrew' },
			on: '2026-09-13T10:00:00.000Z',
			schemaVersion: 1
		});
		expect(reviewSchema.safeParse(reviews[0]).success).toBe(true);
		expect(reviews[1]).toEqual(review());
		// Reviewed without a note: accepted, and still a valid review.
		const [accepted] = reviewsFromContent([
			parseContentRecord({
				id: controlReview.id,
				kind: 'control-review',
				title: 'products-services: reviewed',
				record: { ...controlReview, status: 'reviewed', note: '' },
				savedAt: controlReview.reviewedAt,
				schemaVersion: CONTENT_SCHEMA_VERSION
			})
		]);
		expect(accepted).toMatchObject({ verdict: 'accepted' });
		expect(accepted).not.toHaveProperty('note');
		// A disputed row with no note still says why, so it stays a valid rejection.
		const [bare] = reviewsFromContent([
			parseContentRecord({
				id: controlReview.id,
				kind: 'control-review',
				title: 'products-services: disputed',
				record: { ...controlReview, note: '' },
				savedAt: controlReview.reviewedAt,
				schemaVersion: CONTENT_SCHEMA_VERSION
			})
		]);
		expect(reviewSchema.safeParse(bare).success).toBe(true);
	});

	it('goes to the evidence store as its own kind, digested like every item', async () => {
		const payload = review();
		const item = parseEvidenceItem({
			kind: 'review',
			id: payload.id,
			digest: await computeEvidenceDigest(payload),
			pushedAt: '2026-09-30T10:00:00.000Z',
			payload
		});
		expect(item.kind).toBe('review');
	});
});
