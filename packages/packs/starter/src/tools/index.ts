import type { ToolDefinition } from '@craftabot/core';
import { calculator } from './calculator.js';
import { checkOffStep } from './check-off-step.js';
import { dice } from './dice.js';
import { libraryTools } from './library.js';
import { lookUpManual } from './look-up-manual.js';
import { makePlan } from './make-plan.js';
import { notebookRead, notebookWrite } from './notebook.js';

/**
 * The V1 tool set (02-AGENT-MODEL.md §2.3), all simulator-safe by
 * construction, plus `make_plan`/`check_off_step` (WP30 stage B), the
 * Librarian's own per-book tools (WP32 stage A), and the Connector's own
 * per-operation tools (WP32 stage B) — offered regardless of whether a
 * Tools brick is fitted at all, the same way Radio's `radio_send` already is.
 */
export const starterTools: ToolDefinition[] = [
	calculator,
	dice,
	notebookRead,
	notebookWrite,
	lookUpManual,
	makePlan,
	checkOffStep,
	...libraryTools
	// The Connector's per-operation tools are synthesised by the registry from
	// the Weather Line (WP58, `47-…` §4.1) — `serviceLines` on the manifest.
];

export { calculator } from './calculator.js';
export { checkOffStep } from './check-off-step.js';
export { connectorTools } from './connector.js';
export { dice } from './dice.js';
export { libraryTools } from './library.js';
export { lookUpManual } from './look-up-manual.js';
export { makePlan } from './make-plan.js';
export { notebookRead, notebookWrite } from './notebook.js';
export { evaluate, tokenise } from './calculator.js';
