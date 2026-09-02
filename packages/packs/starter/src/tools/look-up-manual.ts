import type { ToolDefinition } from '@craftabot/core';
import { z } from 'zod';
import { toolStrings } from '../strings.js';
import { searchEntries, searchManual, type ManualEntry } from '../world/manual.js';

/**
 * `look_up_manual` (02-AGENT-MODEL.md §2.3) — queries the Encyclopedia of the
 * Playroom shipped in world/manual.ts. This is the retrieval lesson: the model
 * cannot know from training that the red key opens the toy chest, only by
 * looking it up. It powers the "locked chest" Goal Card.
 */

const argsSchema = z.object({
	query: z.string().min(1).describe(toolStrings.lookUpManual.query)
});

export const lookUpManual: ToolDefinition = {
	id: 'starter/look_up_manual',
	name: toolStrings.lookUpManual.name,
	description: toolStrings.lookUpManual.description,
	parameters: z.toJSONSchema(argsSchema),
	riskTier: 'observe',
	execute(rawArgs, context) {
		const parsed = argsSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return { ok: false, output: toolStrings.lookUpManual.badArgs };
		}
		// The static manual, plus whatever a scenario injected into this room (WP44, `32-…` §4.2).
		const extras =
			(context?.worldState as { manualExtras?: ManualEntry[] } | undefined)?.manualExtras ?? [];
		const entries = [
			...searchManual(parsed.data.query),
			...searchEntries(extras, parsed.data.query)
		];
		if (entries.length === 0) {
			return {
				ok: true,
				output: toolStrings.lookUpManual.nothingFound(parsed.data.query),
				data: { query: parsed.data.query, entries: [] }
			};
		}
		return {
			ok: true,
			output: entries.map((entry) => entry.text).join(' '),
			data: { query: parsed.data.query, entries: entries.map((entry) => entry.id) }
		};
	}
};
