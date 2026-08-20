import type { ToolDefinition } from '@craftabot/core';
import { z } from 'zod';
import { toolStrings } from '../strings.js';

/**
 * `make_plan` (WP30 stage B, `14-…` §5.1) — the Planner brick's own tool, not
 * the Tool Belt's: `contributeCalls` lets any brick offer a tool id, and the
 * Planner offers this one regardless of whether a Tools brick is fitted at
 * all (the same "a brick's own tool" pattern Radio's `radio_send` already
 * established).
 *
 * Deliberately a plain confirmation, with no count or step text in its own
 * output: this `execute()` runs once per pack, shared by every bot that has
 * a Planner fitted, and has no way to know *this* bot's own `maxSteps` — a
 * config the brick that offers the tool holds, not the tool itself. The real
 * accounting (was the plan too long, what does it actually say now) happens
 * in the Planner's own `onTickEnd`, which does know, and shows up in the
 * checklist the very next tick.
 */
const argsSchema = z.object({
	steps: z.array(z.string().min(1)).min(1).describe(toolStrings.makePlan.steps)
});

export const makePlan: ToolDefinition = {
	id: 'starter/make_plan',
	name: toolStrings.makePlan.name,
	description: toolStrings.makePlan.description,
	parameters: z.toJSONSchema(argsSchema),
	riskTier: 'observe',
	execute(rawArgs) {
		const parsed = argsSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return { ok: false, output: toolStrings.makePlan.badArgs };
		}
		return { ok: true, output: toolStrings.makePlan.noted, data: { steps: parsed.data.steps } };
	}
};
