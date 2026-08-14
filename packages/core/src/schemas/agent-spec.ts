import { z } from 'zod';

/**
 * AgentSpec — the assembled agent (02-AGENT-MODEL.md §6). Crosses a storage/
 * kit-file boundary, so per 10-CODING-STANDARDS.md §1 the schema is the type
 * source (`z.infer`), not a hand-written interface.
 */
export const llmBrickSchema = z.object({
	/**
	 * Empty means "brick fitted, cartridge slot still empty" — a normal state
	 * halfway through a build, and one the bench must be able to save. The
	 * `unknown-cartridge` build check is what stops GO until a cartridge is in.
	 */
	cartridgeId: z.string(),
	temperature: z.number().min(0).max(2),
	maxTokens: z.number().int().positive(),
	personality: z.string()
});

export const memoryBrickSchema = z.object({
	windowSize: z.union([z.literal(3), z.literal(10), z.literal(30)]),
	notebook: z.boolean(),
	/**
	 * How the history reaches the model (E7, `14-…` §4.2). Omitted = `window`.
	 *
	 * `window` is the prose form the kit has always sent and the only option the
	 * bench shows: a child reading the Flight Recorder should meet a paragraph
	 * saying what the bot remembers, not a function-calling transcript.
	 * `transcript` is the Workshop's realism mode.
	 *
	 * Optional rather than defaulted, for the same reason `repeatLimit` is: every
	 * kit file written before the dial existed still validates, and no migration
	 * is owed.
	 */
	strategy: z.enum(['window', 'transcript']).optional()
});

export const toolsBrickSchema = z.object({
	enabled: z.array(z.string().min(1))
});

export const senseBrickSchema = z.object({
	channels: z.array(z.string().min(1))
});

export const actionsBrickSchema = z.object({
	enabled: z.array(z.string().min(1))
});

export const safetyBrickSchema = z.object({
	maxTicks: z.number().int().positive(),
	blockedActions: z.array(z.string().min(1)),
	approvalMode: z.boolean(),
	/**
	 * Stop the bot after this many identical moves in a row. Omitted = off.
	 *
	 * Optional rather than defaulted so that every kit file written before the
	 * rule existed still validates, and so that a builder who has not thought
	 * about it does not silently get a policy they did not choose.
	 */
	repeatLimit: z.number().int().min(2).max(10).optional()
});

export const agentSpecSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1),
	bricks: z.object({
		llm: llmBrickSchema.optional(),
		memory: memoryBrickSchema.optional(),
		tools: toolsBrickSchema.optional(),
		sense: senseBrickSchema.optional(),
		actions: actionsBrickSchema.optional(),
		safety: safetyBrickSchema.optional()
	}),
	goalCardId: z.string().min(1),
	/**
	 * The Free Play card is a laminated card the user writes their own goal on
	 * (02-AGENT-MODEL.md §3, 03-UI-UX-DESIGN.md §4.5). Cards with a fixed goal
	 * ignore this. Optional, so every kit file written before it existed is
	 * still valid.
	 */
	customGoalText: z.string().optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	schemaVersion: z.literal(1)
});

export type AgentSpec = z.infer<typeof agentSpecSchema>;

export function parseAgentSpec(value: unknown): AgentSpec {
	return agentSpecSchema.parse(value);
}

export function safeParseAgentSpec(value: unknown): ReturnType<typeof agentSpecSchema.safeParse> {
	return agentSpecSchema.safeParse(value);
}
