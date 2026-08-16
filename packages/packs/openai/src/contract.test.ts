import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import openAiPack from './index.js';

/**
 * **The WP21 definition of done, openai's half.** This pack ships nothing but
 * cartridges — no world, no tools, no brick kinds, no golden trace to run —
 * which is exactly the case `describeConformance` is meant to handle cleanly:
 * a fixture that supplies only `manifest` still gets the manifest check and
 * one check per cartridge, and nothing else is asserted for content this pack
 * never claimed to have.
 */
const fixture: PackConformanceFixture = {
	manifest: openAiPack
};

describeConformance(fixture);
