import { describeConformance } from '@craftabot/pack-testkit';
import openAiPack from '@craftabot/pack-openai';
import personasPack from './index.js';

/**
 * A cartridge-only pack is a complete pack as far as the conformance kit is
 * concerned (`describe-conformance.ts`'s own comment, proven first by
 * `@craftabot/pack-openai`) — no world, no tools, no golden trace to fix.
 */
// The pack names OpenAI's provider (WP52, `40-DEBTS.md` §4.5), so the conformance run registers it first.
describeConformance({ manifest: personasPack, companionPacks: [openAiPack] });
