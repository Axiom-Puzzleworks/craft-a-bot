import { z } from 'zod';

/**
 * **A saved view** (WP109, `96-CONTROL-ROOM-V3.md` §2.2; `83-…` §6.7.1): a
 * Workshop screen's filters, sort, window and selection as a named view —
 * which is a URL, since every one of those lives in the URL. Saved under
 * the lens that saved it and listed on that lens's rail. The fifth content
 * kind (`local/views/<slug>`); never a pack's, never evidence, never in a
 * kit file. Three strings and a title: `core` holds the shape only because
 * the content envelope validates every kind it names.
 */
export const savedViewSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	/** The lens id it was saved under — the rail lists a lens's own. */
	lens: z.string().min(1),
	/** The route without the host's base: `/workshop/runs`. */
	route: z.string().regex(/^\//, { message: 'a route starts at the root' }),
	/** The search string as the URL carried it: `?outcome=SUCCESS`, or empty. */
	search: z.string().regex(/^(\?.*)?$/, { message: 'a search string starts with ? or is empty' }),
	schemaVersion: z.literal(1)
});
export type SavedView = z.infer<typeof savedViewSchema>;
