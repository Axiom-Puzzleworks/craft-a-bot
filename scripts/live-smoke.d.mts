/** Types for `live-smoke.mjs`, for the harness test that holds it (WP194). */
export function itemKey(item: string): string;
export function readSmoke(
	recording: { cells: Array<{ cellKey: string; outcome?: string; calls: unknown[] }> },
	items: { failedForReal: Array<{ item: string }>; controls: string[] }
): {
	failedForReal: number;
	stillFailing: string[];
	controls: number;
	controlsNowFailing: string[];
	lines: string[];
};
