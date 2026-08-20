import type { ToolDefinition } from '@craftabot/core';
import { calculator } from './calculator.js';
import { checkOffStep } from './check-off-step.js';
import { dice } from './dice.js';
import { lookUpManual } from './look-up-manual.js';
import { makePlan } from './make-plan.js';
import { notebookRead, notebookWrite } from './notebook.js';

/**
 * The V1 tool set (02-AGENT-MODEL.md §2.3), all simulator-safe by
 * construction, plus `make_plan`/`check_off_step` (WP30 stage B) — the
 * Planner brick's own tools, offered regardless of whether a Tools brick is
 * fitted at all, the same way Radio's `radio_send` already is.
 */
export const starterTools: ToolDefinition[] = [
	calculator,
	dice,
	notebookRead,
	notebookWrite,
	lookUpManual,
	makePlan,
	checkOffStep
];

export { calculator } from './calculator.js';
export { checkOffStep } from './check-off-step.js';
export { dice } from './dice.js';
export { lookUpManual } from './look-up-manual.js';
export { makePlan } from './make-plan.js';
export { notebookRead, notebookWrite } from './notebook.js';
export { evaluate, tokenise } from './calculator.js';
