import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '@craftabot/core';
import { valueKeeper } from './values.js';

/**
 * The value keeper (WP160, `112-REAL-ENOUGH-PLAN.md` §5): a stage value over
 * the record's cap is kept whole under `<out>/values/<digest>.json`, once per
 * digest, as the canonical JSON the digest is of — so a reader can verify the
 * file against the digest the record carries.
 */
const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

describe('the value keeper', () => {
	it('writes each value under its digest, once, and the file hashes to its name', async () => {
		const out = await mkdtemp(join(tmpdir(), 'craftabot-values-'));
		roots.push(out);
		const keeper = valueKeeper(out);
		const value = { notes: 'x'.repeat(20_000), b: 1, a: [2, 1] };
		const digest = sha256Hex(canonicalJson(value));
		keeper.keep({ digest, value });
		keeper.keep({ digest, value });
		keeper.keep({ digest: sha256Hex(canonicalJson(null)), value: null });
		await keeper.done();
		expect((await readdir(join(out, 'values'))).sort()).toEqual(
			[`${digest}.json`, `${sha256Hex('null')}.json`].sort()
		);
		const text = await readFile(join(out, 'values', `${digest}.json`), 'utf8');
		expect(sha256Hex(text.trimEnd())).toBe(digest);
		expect(JSON.parse(text)).toEqual(value);
		expect(keeper.kept.size).toBe(2);
	});

	it('creates nothing when nothing was over the cap', async () => {
		const out = await mkdtemp(join(tmpdir(), 'craftabot-values-'));
		roots.push(out);
		const keeper = valueKeeper(out);
		await keeper.done();
		expect(await readdir(out)).toEqual([]);
	});
});
