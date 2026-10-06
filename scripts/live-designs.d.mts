/** Types for `live-designs.mjs`, for the harness test that holds it (WP168). */
export const CARTRIDGE: string;
export const MAX_TOKENS: number;
export interface LiveEntry {
	base: string;
	size: number;
	variant?: string;
}
export const LIVE: LiveEntry[];
export function liveIdOf(entry: LiveEntry): string;
export function cassettePathOf(entry: LiveEntry, cassetteRoot?: string): string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function liveDesign(entry: LiveEntry, cassetteRoot?: string): any;
