import { z } from 'zod';

/**
 * validateSpec()'s output (02-AGENT-MODEL.md §6). Rendered by the build-checks
 * ribbon (03-UI-UX-DESIGN.md §4.4): only `blocking` problems disable GO,
 * everything else explains without blocking.
 *
 * Zod-first since WP4: `AgentRecord.lastValidation` embeds these, so they cross
 * the storage boundary and must be validated on the way back in
 * (10-CODING-STANDARDS.md §1).
 */

export const buildProblemSeveritySchema = z.enum(['blocking', 'warning']);
export type BuildProblemSeverity = z.infer<typeof buildProblemSeveritySchema>;

export const buildProblemCodeSchema = z.enum([
	'missing-brain',
	'unknown-cartridge',
	'unknown-goal-card',
	'unknown-tool',
	'unknown-sense-channel',
	'unknown-action',
	'unknown-blocked-action',
	'tool-needs-notebook',
	/**
	 * Spec v2, from the open brick contract (`14-…` §2.1, WP14).
	 *
	 * `unknown-brick-kind` — the spec names a kind no installed pack provides,
	 * which is what a kit file from someone with an expansion pack you have not
	 * got looks like. `bad-brick-config` — the kind is installed but its config
	 * does not parse against that kind's schema. One generic check each,
	 * replacing the per-brick special cases core used to carry.
	 */
	'unknown-brick-kind',
	'bad-brick-config',
	/** Two bricks fitted to one socket, which V1's teaching-aid rule forbids. */
	'slot-already-filled'
]);
export type BuildProblemCode = z.infer<typeof buildProblemCodeSchema>;

export const brickSlotSchema = z.enum(['llm', 'memory', 'tools', 'sense', 'actions', 'safety']);
export type BrickSlot = z.infer<typeof brickSlotSchema>;

export const buildProblemSchema = z.object({
	code: buildProblemCodeSchema,
	severity: buildProblemSeveritySchema,
	/** Which brick panel this relates to, so the UI can point at it. */
	brick: brickSlotSchema.optional(),
	message: z.string(),
	details: z.record(z.string(), z.unknown()).optional()
});
export type BuildProblem = z.infer<typeof buildProblemSchema>;
