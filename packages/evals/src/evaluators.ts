import type { Evaluator, PackRegistry } from '@craftabot/core';
import { assertionEvaluator } from '@craftabot/governance';

export {
	assertionEvaluator,
	completedCalls,
	evaluateCard,
	evaluationInputFor,
	provisionalRun,
	renderCall,
	type CompletedCall
} from '@craftabot/governance';

/**
 * Every evaluator a registry can answer for: the ones packs shipped, and one
 * `assertionEvaluator` per registered card — so a campaign or a screen
 * resolves any id the same way.
 */
export function evaluatorsOf(registry: PackRegistry): Evaluator[] {
	return [
		...registry.listEvaluators(),
		...registry.listAssertionCards().map((card) => assertionEvaluator(card))
	];
}

export function resolveEvaluator(registry: PackRegistry, id: string): Evaluator | undefined {
	const registered = registry.getEvaluator(id);
	if (registered) return registered;
	const card = registry.getAssertionCard(id);
	return card ? assertionEvaluator(card) : undefined;
}
