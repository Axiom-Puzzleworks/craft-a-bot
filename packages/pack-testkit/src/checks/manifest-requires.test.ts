import { describe, expect, it } from 'vitest';
import type { PackManifest } from '@craftabot/core';
import { checkManifest } from './manifest.js';

/** `13-…` §7's D13 bullet, checked (WP52): `requiresCore` and `requiresPacks` are ranges, evaluated. */
const pack = (over: Partial<PackManifest>): PackManifest => ({
	id: 'p',
	name: 'P',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	...over
});

describe('checkManifest and requirements', () => {
	it('passes a pack whose ranges this core and its companions satisfy', () => {
		const issues = checkManifest(pack({ requiresPacks: { openai: '>=1.0.0' } }), {
			companionPacks: [pack({ id: 'openai', version: '1.0.0' })]
		});
		expect(issues.map((issue) => issue.check)).toEqual([]);
	});

	it('reports a core range this core does not meet, a missing companion, and a companion at the wrong version', () => {
		const core = checkManifest(pack({ requiresCore: '>=9.0.0' }));
		expect(core.map((issue) => issue.check)).toContain('manifest.requires-satisfied');
		expect(core[0]?.message).toContain('core >=9.0.0');

		const missing = checkManifest(pack({ requiresPacks: { openai: '>=1.0.0' } }));
		expect(missing.map((issue) => issue.check)).toContain('manifest.requires-satisfied');
		expect(
			missing.find((issue) => issue.check === 'manifest.requires-satisfied')?.message
		).toContain('not among the companion packs');

		const old = checkManifest(pack({ requiresPacks: { openai: '>=1.0.0' } }), {
			companionPacks: [pack({ id: 'openai', version: '0.5.0' })]
		});
		expect(old.find((issue) => issue.check === 'manifest.requires-satisfied')?.message).toContain(
			'companion is 0.5.0'
		);
	});
});
