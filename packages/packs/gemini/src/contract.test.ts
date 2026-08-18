import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import geminiPack from './index.js';

/**
 * Ships nothing but cartridges — no world, no tools, no brick kinds, no
 * golden trace — the same shape `pack-openai`/`pack-anthropic` proved
 * `describeConformance` handles cleanly.
 */
const fixture: PackConformanceFixture = {
	manifest: geminiPack
};

describeConformance(fixture);
