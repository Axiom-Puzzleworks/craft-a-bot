import type { LiveSuite } from './live-suite.mjs';
/** Types for `live-designs.mjs`, for the harness test that holds it (WP168). */
export const CARTRIDGE: string;
export const MAX_TOKENS: number;
export interface LiveEntry {
	base: string;
	/** The book population size; absent for a design over scenarios. */
	size?: number;
	/** A design over scenarios, not a book (plan 113 §12, item 10). */
	scenarios?: boolean;
	/** The seat is a live customer (WP169). */
	seat?: boolean;
	variant?: string;
	/** How often the design is performed (absent: once); trials beyond the first are passes of their own. */
	trials?: number;
}
export const LIVE: LiveEntry[];
export function liveIdOf(entry: LiveEntry): string;
export function cassettePathOf(entry: LiveEntry, cassetteRoot?: string, suite?: LiveSuite): string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function liveDesign(entry: LiveEntry, cassetteRoot?: string, suite?: LiveSuite): any;
