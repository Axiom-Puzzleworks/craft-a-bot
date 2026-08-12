import type { ToolDefinition } from '@craftabot/core';
import { calculator } from './calculator.js';
import { dice } from './dice.js';
import { lookUpManual } from './look-up-manual.js';
import { notebookRead, notebookWrite } from './notebook.js';

/** The V1 tool set (02-AGENT-MODEL.md §2.3). All simulator-safe by construction. */
export const starterTools: ToolDefinition[] = [
	calculator,
	dice,
	notebookRead,
	notebookWrite,
	lookUpManual
];

export { calculator } from './calculator.js';
export { dice } from './dice.js';
export { lookUpManual } from './look-up-manual.js';
export { notebookRead, notebookWrite } from './notebook.js';
export { evaluate, tokenise } from './calculator.js';
