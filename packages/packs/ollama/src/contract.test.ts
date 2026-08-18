import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import ollamaPack from './index.js';

/**
 * Ships nothing but cartridges — no world, no tools, no brick kinds, no
 * golden trace — the same shape the other three provider packs proved
 * `describeConformance` handles cleanly.
 */
const fixture: PackConformanceFixture = {
	manifest: ollamaPack
};

describeConformance(fixture);
