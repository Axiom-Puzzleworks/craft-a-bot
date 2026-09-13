import { z } from 'zod';

/**
 * **A control-row review** (WP110, `97-ACCESS.md` §1, decision 4; GAP-1):
 * a reader's review of one control-map row, as a record beside the pack's
 * row and never an edit to it. The pack claims *relevance*; the reader
 * says *reviewed* or *disputed*, under their principal, with a note. The
 * sixth content kind (`local/reviews/<map>--<ref>`); the assurance pack
 * carries it beside the row it is about.
 */
export const controlReviewStatusSchema = z.enum(['reviewed', 'disputed']);
export type ControlReviewStatus = z.infer<typeof controlReviewStatusSchema>;

export const controlReviewSchema = z.object({
	id: z.string().min(1),
	/** The control map's id: `fs-bank/control-map`. */
	mapId: z.string().min(1),
	/** The row's `ref` within the map. */
	ref: z.string().min(1),
	status: controlReviewStatusSchema,
	/** The reviewer, as the host names them (`55-PRINCIPAL.md`): a name or an id, never a secret. */
	by: z.string().min(1),
	note: z.string(),
	reviewedAt: z.string().datetime(),
	schemaVersion: z.literal(1)
});
export type ControlReview = z.infer<typeof controlReviewSchema>;

/** The review's local id: one per row, so a second review replaces the first. */
export function controlReviewSlug(mapId: string, ref: string): string {
	return `${mapId}--${ref}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
