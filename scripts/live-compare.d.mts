/** Types for `live-compare.mjs`, for the harness test that holds it (113 §12, the 35B suite). */
export function lostShare(cells: Array<{ campaign: string; outcome: string }>): number;
export function renderComparison(
	rows: Array<{
		giant?: {
			id: string;
			what?: string;
			side?: unknown;
			passHatK?: unknown;
			lost?: number;
			wallMinutes: number;
			tokens?: number;
		};
		quick?: {
			id: string;
			what?: string;
			side?: unknown;
			passHatK?: unknown;
			lost?: number;
			wallMinutes: number;
			tokens?: number;
		};
	}>
): string;
export function render(): Promise<string | undefined>;
