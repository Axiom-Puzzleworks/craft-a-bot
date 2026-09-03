import type { AssertionCard, PackRegistry } from '@craftabot/core';

/**
 * The Test Bench's cards come from the packs now (WP43, `31-EVALUATORS.md`
 * §4.2): `starter/testbench/*` on the starter pack, `workshop/testbench/*`
 * on the Workshop pack, any expansion's on its own. This module used to
 * hold the five itself; it is a door onto the registry, in the order the
 * packs were installed — starter first, so the bench reads as it always did.
 */
export function testBenchCards(registry: PackRegistry): AssertionCard[] {
	return registry.listAssertionCards();
}
