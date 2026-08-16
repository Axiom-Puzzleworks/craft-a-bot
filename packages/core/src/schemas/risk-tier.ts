import { z } from 'zod';

/**
 * How consequential a tool call or world action is (`14-…` §4.3/§4.5, WP24) —
 * the signal risk-tiered approval reads (`19-…` §3, Safety brick
 * `approval: 'risky'`). `'observe'` changes nothing; `'reversible'` changes
 * something that can be undone; `'irreversible'` cannot. No starter content
 * reaches `'irreversible'` yet — that is future world-pack work (`18-…`
 * WP28's "paint!").
 *
 * Lives in its own file, not `pack-manifest.ts`, so `types/world.ts` (a
 * hand-written interface, not Zod — see its own doc comment) can import the
 * type without reaching into `schemas/pack-manifest.ts`, which itself imports
 * `types/world.ts` and would otherwise cycle.
 */
export const riskTierSchema = z.enum(['observe', 'reversible', 'irreversible']);
export type RiskTier = z.infer<typeof riskTierSchema>;
