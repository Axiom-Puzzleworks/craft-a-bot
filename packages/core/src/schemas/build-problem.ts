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
	'tool-needs-notebook'
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
