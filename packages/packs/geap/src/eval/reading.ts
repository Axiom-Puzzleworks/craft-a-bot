import { z } from 'zod';

/**
 * **What an `evaluateInstances` response says** (`39-HOSTED-EVALUATOR.md`
 * §4.1): one result per metric asked, each a score, an explanation and
 * (for the prebuilt metrics) a confidence. Parsed with zod, unknown fields
 * ignored; a response that carries no result for the metric asked is a
 * `partial` reading, never a throw — the shape is a best-effort read of
 * the discovery document, checked by the smoke test's evaluation leg.
 */

export type EvalMetric = 'safety' | 'fulfillment' | 'rubric';

export const EVAL_METRICS: readonly EvalMetric[] = ['safety', 'fulfillment', 'rubric'];

const metricResultSchema = z.object({
	score: z.number(),
	explanation: z.string().default(''),
	confidence: z.number().optional()
});

const responseSchema = z.object({
	safetyResult: metricResultSchema.optional(),
	fulfillmentResult: metricResultSchema.optional(),
	pointwiseMetricResult: metricResultSchema.optional()
});

export interface EvalReading {
	outcome: 'ok' | 'partial';
	/** The service's own score, on the metric's own scale. */
	score?: number;
	explanation: string;
	confidence?: number;
}

const RESULT_KEY: Record<EvalMetric, keyof z.infer<typeof responseSchema>> = {
	safety: 'safetyResult',
	fulfillment: 'fulfillmentResult',
	rubric: 'pointwiseMetricResult'
};

export function readEvalResponse(json: unknown, metric: EvalMetric): EvalReading {
	const parsed = responseSchema.safeParse(json);
	if (!parsed.success) {
		return {
			outcome: 'partial',
			explanation: 'The evaluation service answered in a shape this pack does not read.'
		};
	}
	const result = parsed.data[RESULT_KEY[metric]];
	if (!result) {
		return {
			outcome: 'partial',
			explanation: `The evaluation service answered without a ${metric} result.`
		};
	}
	return {
		outcome: 'ok',
		score: result.score,
		explanation: result.explanation,
		...(result.confidence !== undefined ? { confidence: result.confidence } : {})
	};
}

/**
 * The service's score on a 0..1 scale: safety is already 0..1; fulfillment
 * is 1..5; a pointwise rubric is on whatever `scale` its template asks for.
 * Clamped, so a score outside the documented range cannot make a verdict
 * out of nothing.
 */
export function normaliseScore(metric: EvalMetric, score: number, scale: number): number {
	const value =
		metric === 'safety' ? score : metric === 'fulfillment' ? (score - 1) / 4 : score / scale;
	return Math.min(1, Math.max(0, value));
}
