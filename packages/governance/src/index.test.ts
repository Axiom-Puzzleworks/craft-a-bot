import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CRAFTABOT_GOVERNANCE_VERSION } from './index.js';

describe('@craftabot/governance', () => {
	it('exports the version package.json says, so the stamp and the tarball cannot disagree', () => {
		const manifest = JSON.parse(
			readFileSync(new URL('../package.json', import.meta.url), 'utf8')
		) as {
			version: string;
			private?: boolean;
			files: string[];
		};
		expect(CRAFTABOT_GOVERNANCE_VERSION).toBe(manifest.version);
		expect(CRAFTABOT_GOVERNANCE_VERSION).toBe('1.0.0-rc.1');
		// The release-candidate decision (WP50, `38-…` §4.1): publishable, and only the library ships.
		expect(manifest.private).toBe(false);
		expect(manifest.files).toEqual(['dist', 'README.md']);
	});
});
