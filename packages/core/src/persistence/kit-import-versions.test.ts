import { describe, expect, it } from 'vitest';
import { makeSpec } from '../testing/storage-fixtures.js';
import { buildKitFile, importKitFile } from './kit-export.js';

/**
 * `requires.core` and `requires.packs` ranges are evaluated on import (WP52,
 * `40-DEBTS.md` §4.2; `12-…` D13) — when the host says what it has.
 */
const kit = buildKitFile(makeSpec(), {
	exportedBy: 'test',
	exportedAt: '2026-09-03T09:00:00.000Z',
	requires: { core: '>=0.0.1 <1.0.0', packs: { starter: '^0.2.0' }, brickKinds: {} }
});

describe('importKitFile and version ranges', () => {
	it('imports when every range is satisfied', () => {
		const result = importKitFile(kit, {
			installedPacks: ['starter'],
			installedPackVersions: { starter: '0.2.5' },
			coreVersion: '0.0.1'
		});
		expect(result.ok).toBe(true);
	});

	it('refuses, naming each mismatch, when a pack or core is outside its range', () => {
		const result = importKitFile(kit, {
			installedPacks: ['starter'],
			installedPackVersions: { starter: '0.3.0' },
			coreVersion: '1.0.0'
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problem.kind).toBe('version-mismatch');
		if (result.problem.kind !== 'version-mismatch') return;
		expect(result.problem.mismatches).toEqual([
			{ id: 'core', required: '>=0.0.1 <1.0.0', installed: '1.0.0' },
			{ id: 'starter', required: '^0.2.0', installed: '0.3.0' }
		]);
		expect(result.problem.message).toContain('starter ^0.2.0 (you have 0.3.0)');
	});

	it('skips the range check when the host says nothing about versions, and still checks presence', () => {
		expect(importKitFile(kit, { installedPacks: ['starter'] }).ok).toBe(true);
		const missing = importKitFile(kit, { installedPacks: [], installedPackVersions: {} });
		expect(missing.ok).toBe(false);
		if (!missing.ok) expect(missing.problem.kind).toBe('missing-packs');
	});
});
