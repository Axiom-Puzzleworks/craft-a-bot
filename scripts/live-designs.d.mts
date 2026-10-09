import type { LiveSuite } from './live-suite.mjs';
/** Types for `live-designs.mjs`, for the harness test that holds it (WP168). */
export const CARTRIDGE: string;
export const MAX_TOKENS: number;
export interface LiveEntry {
	/** The design's own id, where it is not derived from the base (the oversight suite). */
	id?: string;
	base: string;
	/** WP198: the reviewer model at the decisions, and the executors levels to compare. */
	reviewer?: string;
	/** Plan 114 WP200: the book draws the grey zone. */
	greyZone?: boolean;
	executors?: string[];
	baselineExecutors?: string;
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
export const OVERSIGHT: LiveEntry[];
export const PRESSURE: LiveEntry[];
export function designsOf(suite: LiveSuite): LiveEntry[];
export function liveIdOf(entry: LiveEntry): string;
export function cassettePathOf(entry: LiveEntry, cassetteRoot?: string, suite?: LiveSuite): string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function liveDesign(entry: LiveEntry, cassetteRoot?: string, suite?: LiveSuite): any;
