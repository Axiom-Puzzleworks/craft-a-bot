import {
	CONTENT_SCHEMA_VERSION,
	localContentId,
	savedViewSchema,
	slugOf,
	type ContentRecord,
	type SavedView
} from '@craftabot/core';

/**
 * **Saved views** (WP109, `96-CONTROL-ROOM-V3.md` §2.2; `83-…` §6.7.1): a
 * screen's filters, sort, window and selected artefact as a named view —
 * which is to say a URL, since every one of those lives in the URL. Saved
 * under the lens that saved it; listed on that lens's rail; opened by
 * navigation. Content of the kind `view`, never a pack's.
 */
export const VIEW_ROUTE_PREFIX = '/workshop';

/** A view from the page's URL as it stands (the route without the base, the search as is). */
export function viewFromUrl(
	lens: string,
	url: { pathname: string; search: string },
	title: string,
	routePath: (pathname: string) => string = (pathname) => pathname
): ContentRecord {
	const route = routePath(url.pathname);
	if (!route.startsWith(VIEW_ROUTE_PREFIX)) throw new Error(`a view is a Workshop URL: ${route}`);
	const id = localContentId('view', slugOf(`${lens}-${title}`));
	const view: SavedView = {
		id,
		title,
		lens,
		route,
		search: url.search,
		schemaVersion: 1
	};
	return {
		id,
		kind: 'view',
		title,
		record: savedViewSchema.parse(view),
		savedAt: new Date(0).toISOString(),
		schemaVersion: CONTENT_SCHEMA_VERSION
	};
}

/** The href a view opens: its route and search, without the base. */
export function viewHref(view: Pick<SavedView, 'route' | 'search'>): string {
	return `${view.route}${view.search}`;
}

/** The lens's views, titled, newest saved first. */
export function viewsFor(records: readonly ContentRecord[], lens: string): SavedView[] {
	return records
		.filter((record) => record.kind === 'view')
		.map((record) => savedViewSchema.safeParse(record.record))
		.flatMap((parsed) => (parsed.success ? [parsed.data] : []))
		.filter((view) => view.lens === lens)
		.sort((a, b) => a.title.localeCompare(b.title));
}
