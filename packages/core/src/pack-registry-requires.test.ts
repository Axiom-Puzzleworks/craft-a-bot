import { describe, expect, it } from 'vitest';
import { createPackRegistry } from './pack-registry.js';
import type { PackManifest } from './schemas/pack-manifest.js';
import { CRAFTABOT_CORE_VERSION } from './version.js';

/**
 * Ranges are evaluated at registration (WP52, `40-DEBTS.md` §4.2; `12-…`
 * D13): a pack that needs a core this is not, or a pack that is not there
 * or is the wrong version, is refused by name.
 */
const pack = (over: Partial<PackManifest>): PackManifest => ({
	id: 'p',
	name: 'P',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	...over
});

describe('registerPack and requirements', () => {
	it('accepts a pack whose requiresCore this core satisfies, and refuses one it does not', () => {
		const registry = createPackRegistry();
		expect(() =>
			registry.registerPack(pack({ requiresCore: `>=${CRAFTABOT_CORE_VERSION}` }))
		).not.toThrow();
		expect(() => registry.registerPack(pack({ id: 'q', requiresCore: '>=99.0.0' }))).toThrow(
			/needs core >=99\.0\.0, and this is core/
		);
		expect(() => registry.registerPack(pack({ id: 'r', requiresCore: 'nonsense' }))).toThrow(
			/needs core nonsense/
		);
	});

	it('refuses a pack whose required pack is missing, or present at the wrong version, and accepts it in order', () => {
		const registry = createPackRegistry();
		expect(() =>
			registry.registerPack(pack({ id: 'personas', requiresPacks: { openai: '>=1.0.0' } }))
		).toThrow(/needs pack "openai" \(>=1\.0\.0\), which is not registered/);
		registry.registerPack(pack({ id: 'openai', version: '0.9.0' }));
		expect(() =>
			registry.registerPack(pack({ id: 'personas', requiresPacks: { openai: '>=1.0.0' } }))
		).toThrow(/needs pack "openai" >=1\.0\.0, and "openai" is 0\.9\.0/);

		const ordered = createPackRegistry();
		ordered.registerPack(pack({ id: 'openai', version: '1.2.0' }));
		expect(() =>
			ordered.registerPack(pack({ id: 'personas', requiresPacks: { openai: '^1.0.0' } }))
		).not.toThrow();
		expect(ordered.listPacks().map((entry) => entry.id)).toEqual(['openai', 'personas']);
	});
});
