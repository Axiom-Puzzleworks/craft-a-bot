import { describeConformance } from '@craftabot/pack-testkit';
import personasPack from './index.js';

/**
 * A cartridge-only pack is a complete pack as far as the conformance kit is
 * concerned (`describe-conformance.ts`'s own comment, proven first by
 * `@craftabot/pack-openai`) — no world, no tools, no golden trace to fix.
 */
describeConformance({ manifest: personasPack });
