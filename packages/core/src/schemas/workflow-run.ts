import { z } from 'zod';
import { engineEventSchema } from './events.js';
import { principalSchema, boundaryVerdictSchema } from './shared.js';
import { contextSpecSchema } from './context.js';
import { workItemSchema } from './book.js';

/**
 * **A workflow run** (WP79, `69-WORKFLOWS.md` §4; `64-…` §6.2.2): the
 * artefact — every stage's record with its input and output digests (and
 * the values when small), its executor, its guard tally, the agent run it
 * made if a bot did it, and a digest over the records so a re-run from
 * stage *n* is checkable stage by stage. `docs/schemas/workflow-run.schema.json`.
 */
export const executorRecordSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('rule'), rule: z.string() }),
	z.object({
		kind: z.literal('agent'),
		until: z.string(),
		maxTicks: z.number().int().optional(),
		goalText: z.string().optional()
	}),
	z.object({
		kind: z.literal('human'),
		prompt: z.string(),
		options: z.array(z.string()),
		default: z.string().optional()
	}),
	z.object({ kind: z.literal('line'), lineId: z.string(), operation: z.string() })
]);
export type ExecutorRecord = z.infer<typeof executorRecordSchema>;

export const stageValueSchema = z.object({
	/** SHA-256 over the canonical JSON of the value. */
	digest: z.string().min(1),
	/** Kept when under the size cap, else the digest alone. */
	value: z.unknown().optional()
});

export { boundaryVerdictSchema, type BoundaryVerdict } from './shared.js';
export {
	guardPointSchema,
	stackFitSchema,
	stackGroupSchema,
	stackSchema,
	type GuardPointRecord,
	type Stack,
	type StackFit,
	type StackGroup
} from './stack.js';

export const stageRecordSchema = z.object({
	stageId: z.string().min(1),
	executor: executorRecordSchema,
	startedTick: z.number().int().nonnegative(),
	endedTick: z.number().int().nonnegative(),
	durationMs: z.number().nonnegative(),
	input: stageValueSchema,
	output: stageValueSchema,
	guards: z.object({
		checked: z.number().int().nonnegative(),
		tripped: z.array(
			z.object({
				guardrailId: z.string(),
				disposition: z.string(),
				cause: z.string().optional()
			})
		),
		/** The boundary chain's verdicts, in order (WP95); absent when the stage had no boundary guards. */
		verdicts: z.array(boundaryVerdictSchema).optional()
	}),
	/** The agent run, when the executor was a bot. */
	runId: z.string().optional(),
	approval: z
		.object({
			requested: z.literal(true),
			by: principalSchema.optional(),
			decision: z.string()
		})
		.optional(),
	status: z.enum(['ok', 'blocked', 'escalated', 'error']),
	/** Why a stage is `error` or `blocked`, in a sentence. */
	finding: z.string().optional()
});
export type StageRecord = z.infer<typeof stageRecordSchema>;

export const workflowConfigRecordSchema = z.object({
	executors: z.record(z.string(), executorRecordSchema).optional(),
	knobs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
	/** The journey's stack and the per-stage stacks (WP97), by id. */
	stack: z.string().min(1).optional(),
	stageStacks: z.record(z.string(), z.string().min(1)).optional(),
	autonomy: z
		.object({
			level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
			ceilings: z
				.record(
					z.string(),
					z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
				)
				.optional()
		})
		.optional(),
	context: contextSpecSchema.optional()
});

export const workflowRunSchema = z.object({
	schemaVersion: z.literal(1),
	id: z.string().min(1),
	workflowId: z.string().min(1),
	itemId: z.string().min(1),
	populationDigest: z.string().optional(),
	config: workflowConfigRecordSchema,
	startedAt: z.string(),
	finishedAt: z.string(),
	outcome: z.enum(['completed', 'stopped', 'abandoned']),
	stages: z.array(stageRecordSchema),
	/** Every agent run the workflow made. */
	runIds: z.array(z.string()),
	/** The workflow's own events: `stage.*` for the non-agent stages and what those stages did. */
	events: z.array(engineEventSchema),
	/** SHA-256 over the canonical JSON of `stages`. */
	digest: z.string().min(1)
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export function parseWorkflowRun(value: unknown): WorkflowRun {
	return workflowRunSchema.parse(value);
}

/**
 * **A workflow run as a store keeps it** (WP86, `77-PIPELINE-AND-BOUNDARY.md`
 * §3): the run with the item it worked — so the Pipeline's *What if* can
 * re-run from a stage — where it came from, and the run it was forked from
 * when it is a what-if. The harness writes the bare run beside its agent
 * runs; a store wraps it.
 */
export const storedWorkflowRunSchema = z.object({
	run: workflowRunSchema,
	item: workItemSchema.optional(),
	source: z
		.object({
			kind: z.enum(['campaign', 'bank', 'import', 'what-if', 'harness']),
			id: z.string().optional(),
			build: z.string().optional(),
			desk: z.string().optional()
		})
		.optional(),
	forkedFrom: z.object({ runId: z.string().min(1), stageId: z.string().min(1) }).optional(),
	createdAt: z.string().datetime(),
	schemaVersion: z.literal(1)
});
export type StoredWorkflowRun = z.infer<typeof storedWorkflowRunSchema>;

export function safeParseStoredWorkflowRun(
	value: unknown
): ReturnType<typeof storedWorkflowRunSchema.safeParse> {
	return storedWorkflowRunSchema.safeParse(value);
}
