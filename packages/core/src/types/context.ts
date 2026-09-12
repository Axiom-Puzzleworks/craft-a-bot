/**
 * **Context: the ladder** (WP81, `70-CONTEXT-AND-ONTOLOGY.md` §3;
 * `64-TARGET-DESIGN-V5.md` §6.3.1): what a bot is given about the case
 * before it acts, on four rungs — the work item alone, the case file as
 * today, the customer's related records rendered flat, or the case file
 * with a knowledge card from the bank's ontology. A campaign axis and a
 * workflow configuration's field; it reaches the world at `create` as
 * `config.context`, beside the knobs, and the desk runtime composes the
 * case by it. Purpose-gating is unchanged at every rung.
 */
export type ContextLevel = 'minimal' | 'case-file' | 'relational' | 'ontology';
export type ContextDelivery = 'brief' | 'sense' | 'line';

export interface ContextSpec {
	id: string;
	level: ContextLevel;
	/** Record kinds pulled onto the desk from hidden at this rung, beyond the rung's own. */
	include?: string[];
	/** Record kinds the rung would add but does not. */
	exclude?: string[];
	/** The ontology rung's reach: the case's customer, or the bank with its governance entities; how many relations out. */
	ontology?: { scope: 'customer' | 'bank'; depth: number; relations?: string[] };
	/** Where the added context reaches the bot: the desk brief, the runtime's `context` sense, the `graph` line. */
	delivery: ContextDelivery[];
	/** The knowledge card is truncated to this, with a note, so a rung is comparable across cases. */
	budgetTokens?: number;
}

export const CONTEXT_LEVELS: readonly ContextLevel[] = [
	'minimal',
	'case-file',
	'relational',
	'ontology'
];

/** The rung every campaign and desk runs at when none is named: the case file, delivered as the desk's senses always have. */
export const DEFAULT_CONTEXT: ContextSpec = {
	id: 'case-file',
	level: 'case-file',
	delivery: ['sense']
};

/** A rung's plain spec — its id the level, sense delivery, the ontology rung one relation out from the customer. */
export function contextSpecFor(level: ContextLevel): ContextSpec {
	return {
		id: level,
		level,
		delivery: ['sense'],
		...(level === 'ontology' ? { ontology: { scope: 'customer', depth: 1 } } : {})
	};
}

/** Where a rung sits on the ladder, so a superset check can order them. */
export function contextRank(level: ContextLevel): number {
	return CONTEXT_LEVELS.indexOf(level);
}
