import { createWindowMemory, type MemoryStrategy } from './memory.js';
import { sectionsPromptStrategy, transcriptPromptStrategy, type PromptStrategy } from './prompt.js';

/**
 * **The strategy seams, and how a spec picks one** (E7, `14-…` §3).
 *
 * Two seams, because context assembly has two independent decisions in it:
 * what the agent *keeps* between ticks (`MemoryStrategy`) and how what it kept
 * *reads* to the model (`PromptStrategy`). V1 had neither — the ring buffer and
 * the three-section template were hard-coded, which is `12-…` D5, and there was
 * no way to reach the real tool-result protocol at all, which is D12.
 *
 * The Memory brick carries one dial (`strategy`), because a builder is choosing
 * one thing: *how my bot's history works*. Which pair of implementations that
 * selects is this module's business and nobody else's.
 */

/** The named pairings a spec may ask for. */
export type StrategyName = 'window' | 'transcript';

export const DEFAULT_STRATEGY: StrategyName = 'window';

export interface Strategies {
	memory: MemoryStrategy;
	prompt: PromptStrategy;
}

/**
 * **Why only one memory implementation ships.**
 *
 * The symmetry invites a `transcript-v1` retention strategy to sit opposite the
 * `transcript-v1` prompt strategy, and there is nothing for it to do. A
 * transcript differs from the prose form in how a turn is *rendered*, not in
 * which turns survive: both keep the last N whole turns, and keeping whole
 * turns is exactly what makes a windowed transcript well-formed, since a window
 * that split a turn would strand a tool result answering a call it had dropped.
 *
 * Building a second retention strategy that delegated to the first would make
 * the table look tidy and would be a fake seam — a thing that looks like a
 * choice and cannot be chosen differently. The real second implementations are
 * the summariser and the retrieval memory in `14-…` §4.2, and both need an
 * async `remember`, which is a contract change worth making when there is
 * something to make it for.
 */
export function resolveStrategies(
	name: StrategyName | undefined,
	windowSize: number,
	overrides?: Partial<Strategies>
): Strategies {
	const chosen: StrategyName = name ?? DEFAULT_STRATEGY;
	return {
		memory: overrides?.memory ?? createWindowMemory(windowSize),
		prompt: overrides?.prompt ?? promptStrategyFor(chosen)
	};
}

function promptStrategyFor(name: StrategyName): PromptStrategy {
	return name === 'transcript' ? transcriptPromptStrategy : sectionsPromptStrategy;
}
