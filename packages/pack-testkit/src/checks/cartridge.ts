import { cartridgeDefinitionSchema, type CartridgeDefinition } from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

/**
 * "Every cartridge: catalogue entry complete; defaults consumed
 * (post-`14-…` §4.1)" (`13-…` §7).
 *
 * Only the first half is checked. Nothing in the engine reads
 * `.defaults.temperature` or `.defaults.maxTokens` yet — `14-…` §4.1 has not
 * shipped (`catalogue.ts`'s own Penny Thinker comment says as much) — so
 * there is no consumption to assert against. See the dated amendment in
 * `13-…` §7.
 */
export function checkCartridge(cartridge: CartridgeDefinition): ConformanceIssue[] {
	const parsed = cartridgeDefinitionSchema.safeParse(cartridge);
	if (parsed.success) return [];
	return [
		{
			check: 'cartridge.entry-complete',
			message: `"${cartridge.id}" is not a complete catalogue entry: ${parsed.error.message}`
		}
	];
}
