import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import anthropicPack from './index.js';

/**
 * Ships nothing but cartridges — no world, no tools, no brick kinds, no
 * golden trace — the same shape `pack-openai/contract.test.ts` proved
 * `describeConformance` handles cleanly.
 */
const fixture: PackConformanceFixture = {
	manifest: anthropicPack
};

describeConformance(fixture);
