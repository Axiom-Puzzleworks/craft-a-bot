import type { NotebookAccess } from '../types/tool.js';

/**
 * The Memory brick (02-AGENT-MODEL.md §2.2): a rolling window of the last N
 * ticks, plus a notebook the `notebook_*` tools read and write.
 *
 * With no Memory brick there is no window and no notebook, so each tick's
 * prompt carries only the goal and the current observation — the bot forgets
 * everything between ticks. That is a *designed* teaching moment, not a
 * degraded mode, so this module makes "no memory" a first-class state rather
 * than something the loop has to special-case.
 */

export interface TickMemory {
	tick: number;
	observation: string;
	thought: string;
	/** What it tried, and what came back — both matter for learning from failure. */
	action?: string;
	result?: string;
}

export interface Memory {
	readonly enabled: boolean;
	readonly notebookEnabled: boolean;
	remember(entry: TickMemory): void;
	/** Oldest first, as the prompt wants it (02-AGENT-MODEL.md §8). */
	window(): TickMemory[];
	notebook: NotebookAccess;
	/** Count of entries currently held — reported on `memory.updated`. */
	size(): number;
}

export function createMemory(config?: { windowSize: number; notebook: boolean }): Memory {
	const entries: TickMemory[] = [];
	const notebookLines: string[] = [];
	const enabled = config !== undefined;
	const notebookEnabled = config?.notebook ?? false;

	return {
		enabled,
		notebookEnabled,
		remember(entry) {
			if (!config) return;
			entries.push(entry);
			while (entries.length > config.windowSize) entries.shift();
		},
		window() {
			return [...entries];
		},
		notebook: {
			read: () => (notebookEnabled ? [...notebookLines] : []),
			append: (line) => {
				if (notebookEnabled) notebookLines.push(line);
			}
		},
		size: () => entries.length
	};
}

/** Renders the window as the prompt's memory section — plain prose, oldest first. */
export function summariseWindow(entries: TickMemory[]): string {
	return entries
		.map((entry) => {
			const parts = [`Tick ${entry.tick}: you saw — ${entry.observation}`];
			if (entry.thought) parts.push(`you thought — ${entry.thought}`);
			if (entry.action) parts.push(`you did — ${entry.action}`);
			if (entry.result) parts.push(`what happened — ${entry.result}`);
			return parts.join('; ');
		})
		.join('\n');
}
