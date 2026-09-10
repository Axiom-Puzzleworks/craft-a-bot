import { z } from 'zod';

/**
 * **The calibration table** (WP74, `66-CALIBRATION.md` §4.1; `64-…` §6.1.2,
 * tenet 19): the distributions a synthetic population's generators draw
 * from, each row citing the published aggregate it was set to and when —
 * or saying, as a typed assumption, why no publication serves. Content a
 * pack ships (`PackManifest.calibrations`), checked by
 * `@craftabot/pack-testkit`'s `checkCalibration`, rendered on the
 * Playground's bank page so a reviewer can ask "why 17% aged 25–34?" and
 * be shown the table.
 *
 * Declared in `core` because the manifest names it, as the control map is
 * (`53-…` §2 item 1). Nothing in `core` draws from a row; the arithmetic is
 * the pack's.
 */
export const calibrationSourceSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('publication'),
		publisher: z.string().min(1),
		title: z.string().min(1),
		/** The edition or reference period — "mid-2023", "2024 H2", "Apr–Jun 2026". */
		edition: z.string().min(1),
		/** The table, figure or sheet within it. */
		table: z.string().min(1),
		url: z.string().url().optional(),
		/** ISO date the figures were read. */
		retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
	}),
	z.object({
		kind: z.literal('assumption'),
		/** ISO date the assumption was stated. */
		retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
	})
]);
export type CalibrationSource = z.infer<typeof calibrationSourceSchema>;

export const calibrationReviewSchema = z.union([
	z.literal('pending'),
	z.object({ by: z.string().min(1), on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
]);
export type CalibrationReview = z.infer<typeof calibrationReviewSchema>;

/**
 * `weights`: a categorical draw — category → relative weight, read in the
 * row's declared order. `rates`: independent probabilities — category →
 * P(category), each in [0, 1]. `target`: no generator draws it; the
 * population's marginal is asserted against it (a check, not a draw).
 */
export const calibrationRowKindSchema = z.enum(['weights', 'rates', 'target']);
export type CalibrationRowKind = z.infer<typeof calibrationRowKindSchema>;

export const calibrationRowSchema = z.object({
	/** Unique within its table: `age-band`, `employment-18-24`, … */
	id: z.string().min(1),
	kind: calibrationRowKindSchema,
	title: z.string().min(1),
	distribution: z.record(z.string().min(1), z.number().finite().nonnegative()),
	source: calibrationSourceSchema,
	/** What was simplified, and why; the arithmetic from the source's figures to the row's. Required on an assumption. */
	note: z.string().optional(),
	/** The calibration test's allowed absolute deviation per category, on the marginal. */
	tolerance: z.number().gt(0).lt(1),
	review: calibrationReviewSchema
});
export type CalibrationRow = z.infer<typeof calibrationRowSchema>;

export const calibrationTableSchema = z.object({
	/** Qualified, like every content id: `{packId}/{localId}`. */
	id: z.string().min(1),
	title: z.string().min(1),
	description: z.string().min(1),
	rows: z.array(calibrationRowSchema)
});
export type CalibrationTable = z.infer<typeof calibrationTableSchema>;

/** A row by id; throws on a missing one, because a generator reading a row that is not there is a bug, not a case. */
export function calibrationRow(table: CalibrationTable, id: string): CalibrationRow {
	const row = table.rows.find((candidate) => candidate.id === id);
	if (!row) throw new Error(`calibration table "${table.id}" has no row "${id}"`);
	return row;
}
