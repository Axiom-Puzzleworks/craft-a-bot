import type { MemorySlotConfig } from '../schemas/slot-contracts.js';
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
 *
 * > **WP15 (E7):** retention is now a *strategy* rather than a hard-coded ring
 * > buffer. `window-v1` is the one this kit ships and the default everywhere;
 * > the seam exists so that the summariser and the retrieval memory the
 * > expansion packs promise (`14-…` §4.2) are new implementations rather than
 * > new `if`s in here.
 */

export interface TickMemory {
	tick: number;
	/**
	 * The *short* form of what was seen (`Observation.summary`), not the full
	 * text. A window of ten full observations made the history 86% of the prompt
	 * and buried the goal; the current turn still gets the complete picture.
	 */
	observation: string;
	thought: string;
	/** What it tried, and what came back — both matter for learning from failure. */
	action?: string;
	result?: string;
	/**
	 * Why the attempt never reached the world: a guardrail blocked it, or a
	 * person denied it.
	 *
	 * Previously these produced no memory entry at all — the tick loop only
	 * recorded `action`/`result` when the call was actually performed. A bot
	 * stopped by the Safety Brick kept no record of having tried, saw the
	 * refusal once in the next observation, and then tried the same thing again
	 * forever.
	 */
	refused?: string;
	/**
	 * The call exactly as proposed — kind, name and arguments (E7).
	 *
	 * `action`/`result` above are *narration*: "tried to move", "you bumped into
	 * the wall". Prose is what the `sections-v1` prompt wants and it is all V1
	 * ever kept, which is precisely why there was no way to rebuild a real
	 * function-calling transcript from memory (`12-…` D12) — the arguments were
	 * gone by the time anyone wanted them.
	 *
	 * Recorded whether or not the call ran: a proposal a guardrail refused is
	 * still a proposal the model made, and a transcript that omitted it would
	 * leave the refusal in `refused` answering nothing.
	 */
	call?: { kind: 'tool' | 'action'; name: string; arguments: unknown };
}

/**
 * **What the agent keeps between ticks** (E7, `14-…` §3).
 *
 * Retention only. How the kept turns are *rendered* into a prompt belongs to
 * the `PromptStrategy` next door, and splitting it that way is what stops the
 * two seams overlapping: this one decides what survives, that one decides how
 * it reads.
 *
 * A strategy is handed every tick and may keep as much or as little as it
 * likes; `window()` is the contract it owes back — oldest first, defensively
 * copied, because the prompt and the bricks both read it and neither may
 * mutate what the agent remembers.
 */
export interface MemoryStrategy {
	/** Stable id, recorded on `run.started` so a trace says how context was kept. */
	readonly id: string;
	remember(entry: TickMemory): void;
	/** Oldest first, as the prompt wants it (02-AGENT-MODEL.md §8). */
	window(): TickMemory[];
	size(): number;
}

/**
 * V1's rolling window, now named (`window-v1`).
 *
 * `windowSize` is whatever the memory slot contract admits — any positive
 * integer. The starter brick's own schema offers 3, 10 and 30, and holding
 * *core* to that list would be core having an opinion about one pack's dial
 * (`12-…` D5 asked for the internal signature to be tightened; the honest
 * tightening is to name the contract, not to adopt the starter brick's three
 * animals).
 */
export function createWindowMemory(windowSize: number): MemoryStrategy {
	const entries: TickMemory[] = [];
	return {
		id: 'window-v1',
		remember(entry) {
			entries.push(entry);
			while (entries.length > windowSize) entries.shift();
		},
		window: () => [...entries],
		size: () => entries.length
	};
}

export interface Memory {
	readonly enabled: boolean;
	readonly notebookEnabled: boolean;
	/**
	 * Which retention strategy is in force — `window-v1` unless a caller passed
	 * its own. `undefined` when no Memory brick is fitted, which is a different
	 * thing from "kept nothing": there is no memory at all to have a strategy.
	 */
	readonly strategy: MemoryStrategy | undefined;
	remember(entry: TickMemory): void;
	/** Oldest first, as the prompt wants it (02-AGENT-MODEL.md §8). */
	window(): TickMemory[];
	notebook: NotebookAccess;
	/** Count of entries currently held — reported on `memory.updated`. */
	size(): number;
	/**
	 * How many lines the notebook has been written since the run began (E8).
	 *
	 * `memory.updated` used to report whether a notebook *existed*, so a bot
	 * that never wrote a word claimed to update its notebook on every tick
	 * (`12-…` D6). Counting writes lets the session say truthfully whether
	 * anything was written *this* tick — and deliberate writes are the
	 * provenance seed for the memory-poisoning curriculum (`14-…` §4.2).
	 */
	writes(): number;
}

/**
 * The Memory brick as the loop sees it: a retention strategy plus a notebook.
 *
 * `strategy` is injectable so the seam is a seam — a test (or the Workshop)
 * can hand in its own and see it used, which is the difference between an
 * interface and a comment claiming one exists.
 */
export function createMemory(config?: MemorySlotConfig, strategy?: MemoryStrategy): Memory {
	const notebookLines: string[] = [];
	const enabled = config !== undefined;
	const notebookEnabled = config?.notebook ?? false;
	const retention = config ? (strategy ?? createWindowMemory(config.windowSize)) : undefined;

	return {
		enabled,
		notebookEnabled,
		strategy: retention,
		remember(entry) {
			retention?.remember(entry);
		},
		window() {
			return retention?.window() ?? [];
		},
		notebook: {
			read: () => (notebookEnabled ? [...notebookLines] : []),
			append: (line) => {
				if (notebookEnabled) notebookLines.push(line);
			}
		},
		size: () => retention?.size() ?? 0,
		writes: () => notebookLines.length
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
			if (entry.refused) parts.push(`refused — ${entry.refused}`);
			return parts.join('; ');
		})
		.join('\n');
}
