import { z } from 'zod';

/**
 * AgentSpec — the assembled agent (02-AGENT-MODEL.md §6). Crosses a storage/
 * kit-file boundary, so per 10-CODING-STANDARDS.md §1 the schema is the type
 * source (`z.infer`), not a hand-written interface.
 */
export const llmBrickSchema = z.object({
	cartridgeId: z.string().min(1),
	temperature: z.number().min(0).max(2),
	maxTokens: z.number().int().positive(),
	personality: z.string()
});

export const memoryBrickSchema = z.object({
	windowSize: z.union([z.literal(3), z.literal(10), z.literal(30)]),
	notebook: z.boolean()
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
	approvalMode: z.boolean()
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
