/** Types for the CI shape check (WP90), so the harness's test can import the script as written. */
export interface ShapeResultLike {
	experimentId: string;
	effects: ReadonlyArray<{
		metricId: string;
		factor: { axis: string; baseline: string; treatment: string };
		baseline: { n: number };
		treatment: { n: number };
	}>;
	verdict: string;
	digest: string;
}
export function shapeOf(result: ShapeResultLike): { experimentId: string; effects: string[] };
export function compareShape(committed: ShapeResultLike, reduced: ShapeResultLike): string[];
