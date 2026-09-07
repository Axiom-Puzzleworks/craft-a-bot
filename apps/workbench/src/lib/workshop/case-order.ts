/**
 * **Failures first** (UX-13; NEW-2 in `docs/manual/UX-AND-GAPS.md`, 2026-09-07).
 * The cases table promises the interesting rows before the rest, and the
 * first comparator put them last — an inverted sign that no test caught
 * because the comparator lived inline in the page. Now a module with a test
 * that asserts the promise, not the widget.
 */
export interface CaseOutcomeLike {
	error?: string | undefined;
	outcome?: string | undefined;
}

/** A case that errored, or ended in anything but SUCCESS. */
export function caseFailed(row: CaseOutcomeLike): boolean {
	return Boolean(row.error) || (row.outcome !== undefined && row.outcome !== 'SUCCESS');
}

/** Sort comparator: failures before successes; stable within each half. */
export function failedFirst(a: CaseOutcomeLike, b: CaseOutcomeLike): number {
	return Number(caseFailed(b)) - Number(caseFailed(a));
}
