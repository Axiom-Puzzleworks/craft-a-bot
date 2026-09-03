import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every export carries a doc comment (WP50, `38-GOVERNANCE-1-0.md` §4.1):
 * the audit script over the two barrels, run as a test so an undocumented
 * export fails this package's own suite rather than a reviewer's eye.
 */
describe('the public surface', () => {
	it('documents every export of both barrels', () => {
		const script = fileURLToPath(
			new URL('../../../scripts/governance-exports.mjs', import.meta.url)
		);
		const root = fileURLToPath(new URL('..', import.meta.url));
		const result = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
		expect(result.stderr).toBe('');
		expect(result.status).toBe(0);
		expect(result.stdout).toContain('every export');
	});
});
