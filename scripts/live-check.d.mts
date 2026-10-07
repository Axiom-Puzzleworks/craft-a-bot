/** Types for `live-check.mjs`, for the harness test that holds it (WP168). */
export function effectKey(effect: unknown): string;
export function compareReplay(
	committed: { verdict: string; effects: unknown[] },
	replayed: { verdict: string; effects: unknown[] }
): string[];
/** Live designs a desk fix has changed on purpose, skipped until re-recorded (WP190). */
export const PENDING_RE_RECORD: Set<string>;
/** What a replay of a cell-scoped recording must not show (WP190). */
export function replayProblems(reports: Array<{ campaignId?: string; cells?: unknown[] }>): string[];
