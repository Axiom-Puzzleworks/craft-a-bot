/** Types for `live-column.mjs`, for the harness test that holds it (WP168). */
interface Entry {
	promptDigest: string;
	occurrence: number;
	response: { text: string; toolCall?: unknown; finishReason: string };
}
interface CellRow {
	campaign: string;
	item: string;
	verdicts: Record<string, string>;
}
export const PRIMARY: Record<string, { metric: string; row: string; what: string }>;
export function baselineSide(
	result: { effects: Array<{ metricId: string; factor: { axis: string }; baseline: unknown }> },
	metric: string
): { value: number; n: number; interval: [number, number] } | undefined;
export function cassetteAgreement(
	a: { entries: Entry[] },
	b: { entries: Entry[] }
): { shared: number; same: number; sameCall: number; onlyA: number; onlyB: number };
export function caseConcordance(a: CellRow[], b: CellRow[]): { compared: number; same: number };
export function finishReasons(cassette: { entries: Entry[] }): Record<string, number>;
export function render(): Promise<string | undefined>;
export function reliabilityRows(
	result: {
		reliability?: Array<{
			campaignId: string;
			k: number;
			items: number;
			metrics: Array<{ metricId: string }>;
		}>;
	},
	metric: string
): Array<{ campaignId: string; k: number; items: number; m: unknown }>;
