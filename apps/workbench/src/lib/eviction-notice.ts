/**
 * What to say when the scrapbook made room (`16-…` §1.5, `12-…` D15).
 *
 * The run cap is real: `evictOldRuns` drops the oldest unpinned runs and has
 * always returned the ids it dropped "so the UI can show the friendly notice".
 * Nothing ever consumed them, so adventures quietly disappeared and the only
 * place it showed was a scrapbook with fewer rows than the child remembered.
 *
 * A separate function rather than markup in the route because the copy is the
 * whole feature — the wording is what makes a silent deletion into an honest
 * one — and copy buried in a route template is copy nobody can test.
 */
export function evictionNotice(evicted: number): string | undefined {
	if (evicted < 1) return undefined;

	const what = evicted === 1 ? 'the oldest adventure was' : `the ${evicted} oldest adventures were`;

	return `The scrapbook was full, so ${what} tidied away to make room. Pin an adventure to keep it for good.`;
}
