import { z } from 'zod';
import { externalCallRecordSchema } from './shared.js';

/**
 * **An evaluation, as the store keeps it** (`31-EVALUATORS.md` §4.1, WP43
 * stage A): one evaluator's verdict over one run — pass/fail for a gate, a
 * score for a dashboard, an explanation and the event ids it rests on, and
 * the network call it made if it made one. Stored beside the run and
 * deleted with it.
 */
export const evaluationResultSchema = z.object({
	evaluatorId: z.string().min(1),
	verdict: z.enum(['pass', 'fail', 'inconclusive']).optional(),
	score: z.number().min(0).max(1).optional(),
	label: z.string().optional(),
	explanation: z.string(),
	evidence: z.array(
		z.object({ eventId: z.string(), tick: z.number().int(), note: z.string().optional() })
	),
	external: externalCallRecordSchema.optional()
});
export type EvaluationResultRecord = z.infer<typeof evaluationResultSchema>;

export const evaluationRecordSchema = z.object({
	id: z.string().min(1),
	runId: z.string().min(1),
	evaluatorId: z.string().min(1),
	campaignId: z.string().optional(),
	result: evaluationResultSchema,
	evaluatedAt: z.string().datetime(),
	schemaVersion: z.literal(1)
});
export type EvaluationRecord = z.infer<typeof evaluationRecordSchema>;

export function safeParseEvaluationRecord(
	value: unknown
): ReturnType<typeof evaluationRecordSchema.safeParse> {
	return evaluationRecordSchema.safeParse(value);
}
