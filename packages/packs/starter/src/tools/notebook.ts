import type { ToolDefinition } from '@craftabot/core';
import { z } from 'zod';
import { toolStrings } from '../strings.js';

/**
 * `notebook_read` / `notebook_write` (02-AGENT-MODEL.md §2.3) — the agent's
 * persistent scratchpad. Both declare `requiresNotebook`, so the session simply
 * does not offer them when the Memory brick is absent or its notebook is
 * switched off, and `validateSpec` explains the dependency on the bench.
 */

const writeArgs = z.object({ note: z.string().min(1).describe(toolStrings.notebook.note) });
const readArgs = z.object({});

export const notebookWrite: ToolDefinition = {
	id: 'starter/notebook_write',
	name: toolStrings.notebook.writeName,
	description: toolStrings.notebook.writeDescription,
	parameters: z.toJSONSchema(writeArgs),
	requiresNotebook: true,
	execute(rawArgs, context) {
		const parsed = writeArgs.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return { ok: false, output: toolStrings.notebook.badArgs };
		}
		context.notebook.append(parsed.data.note);
		return {
			ok: true,
			output: toolStrings.notebook.written(parsed.data.note),
			data: { note: parsed.data.note, lines: context.notebook.read().length }
		};
	}
};

export const notebookRead: ToolDefinition = {
	id: 'starter/notebook_read',
	name: toolStrings.notebook.readName,
	description: toolStrings.notebook.readDescription,
	parameters: z.toJSONSchema(readArgs),
	requiresNotebook: true,
	execute(_rawArgs, context) {
		const lines = context.notebook.read();
		return {
			ok: true,
			output: lines.length > 0 ? toolStrings.notebook.contents(lines) : toolStrings.notebook.empty,
			data: { lines }
		};
	}
};
