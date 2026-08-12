import type { ToolDefinition } from '@craftabot/core';
import { z } from 'zod';
import { toolStrings } from '../strings.js';

/**
 * `dice` (02-AGENT-MODEL.md §2.3) — the *only* sanctioned source of randomness
 * in the whole system (hard rule 5). It draws from the injected
 * `context.random`, and its result lands in the `tool.executed` event, so a
 * recorded run stays reproducible even though it contains a random draw.
 * Teaching point: non-determinism from the model versus determinism from tools.
 */

const argsSchema = z.object({
	sides: z.number().int().min(2).max(100).default(6).describe(toolStrings.dice.sides),
	rolls: z.number().int().min(1).max(10).default(1).describe(toolStrings.dice.rolls)
});

export const dice: ToolDefinition = {
	id: 'starter/dice',
	name: toolStrings.dice.name,
	description: toolStrings.dice.description,
	parameters: z.toJSONSchema(argsSchema),
	execute(rawArgs, context) {
		const parsed = argsSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return { ok: false, output: toolStrings.dice.badArgs };
		}
		const { sides, rolls } = parsed.data;
		const results: number[] = [];
		for (let roll = 0; roll < rolls; roll++) {
			results.push(Math.floor(context.random() * sides) + 1);
		}
		return {
			ok: true,
			output: toolStrings.dice.result(results, sides),
			data: { sides, rolls, results }
		};
	}
};
