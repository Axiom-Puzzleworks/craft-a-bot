import type { ToolDefinition } from '@craftabot/core';
import { z } from 'zod';
import { toolStrings } from '../strings.js';

/**
 * `check_off_step` (WP30 stage B, `14-…` §5.1) — the Planner brick's own
 * second tool, alongside `make_plan`. 1-based, to match the numbers the
 * checklist itself shows the model ("1. Find the key").
 *
 * `execute()` cannot say whether the index is actually on this bot's current
 * plan — that state lives in the Planner's own `onTickEnd`, not here (see
 * `make-plan.ts`'s own note on why) — so its confirmation names only the
 * number given, never a step's text or whether it was real. An invalid index
 * is caught brick-side and surfaced honestly on the next checklist instead
 * of being silently pretended-into a success here.
 */
const argsSchema = z.object({
	index: z.number().int().min(1).describe(toolStrings.checkOffStep.index)
});

export const checkOffStep: ToolDefinition = {
	id: 'starter/check_off_step',
	name: toolStrings.checkOffStep.name,
	description: toolStrings.checkOffStep.description,
	parameters: z.toJSONSchema(argsSchema),
	riskTier: 'observe',
	execute(rawArgs) {
		const parsed = argsSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return { ok: false, output: toolStrings.checkOffStep.badArgs };
		}
		return {
			ok: true,
			output: toolStrings.checkOffStep.noted(parsed.data.index),
			data: { index: parsed.data.index }
		};
	}
};
