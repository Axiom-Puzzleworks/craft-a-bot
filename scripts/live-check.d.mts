/** Types for `live-check.mjs`, for the harness test that holds it (WP168). */
export function effectKey(effect: unknown): string;
export function compareReplay(
	committed: { verdict: string; effects: unknown[] },
	replayed: { verdict: string; effects: unknown[] }
): string[];
