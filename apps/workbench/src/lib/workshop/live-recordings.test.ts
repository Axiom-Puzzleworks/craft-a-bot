import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { liveSiteAssets } from '../../../../../scripts/live-site-assets.mjs';
import { fetchLiveDesign, fetchLiveResult, loadLiveIndex } from './live-recordings.js';

/**
 * **The live recordings the site serves** (WP196's remainder, `114-…`): the build emits them from `docs/evidence/`; the page lists
 * them, opens a result held to its digest and parses a design ready to expand.
 */
const ROOT = resolve(import.meta.dirname, '../../../../..');
const assets = liveSiteAssets(ROOT);
const served = (async (url: string | URL | Request) => {
	const path = String(url).replace(/^\/workshop\//, '');
	const file = assets.find((each) => each.fileName === path);
	return file
		? new Response(file.source as BodyInit, { status: 200 })
		: new Response('', { status: 404 });
}) as typeof fetch;

describe('the live recordings the site serves', () => {
	it('emits, for every recording, its result, its design and the cassette its design names', () => {
		const index = JSON.parse(
			assets.find((a) => a.fileName === 'live/index.json')!.source as string
		);
		expect(index.length).toBeGreaterThanOrEqual(12);
		const names = new Set(assets.map((a) => a.fileName));
		for (const row of index) {
			expect(names.has(row.result), row.id).toBe(true);
			expect(names.has(row.design), row.id).toBe(true);
		}
		// Every cassette a served design names is emitted, as `loadCassettes` will ask for it.
		for (const file of assets.filter((a) => a.fileName.endsWith('.experiment.json'))) {
			const cassette = JSON.parse(file.source.toString()).design.template.brains[0].cassette;
			expect(names.has(`cassettes/${cassette}`), cassette).toBe(true);
		}
		// The 35B suite shares ids with the 122B's and is not offered; the retired variant has no design and is not either.
		expect(index.some((row: { id: string }) => row.id === 'lending-stack-live-b')).toBe(false);
		expect(new Set(index.map((row: { id: string }) => row.id)).size).toBe(index.length);
	});

	it('lists them, opens a result held to its digest and parses a design', async () => {
		const index = await loadLiveIndex('/workshop', served);
		const lending = index.find((row) => row.id === 'lending-oversight-live')!;
		expect(lending.suite).toBe('oversight');
		expect(lending.model).toContain('122B');
		const result = await fetchLiveResult('/workshop', lending, served);
		expect(result.experimentId).toBe('lending-oversight-live');
		const design = await fetchLiveDesign('/workshop', lending, served);
		expect(design.design.trials).toBe(2);
	});

	it('answers an empty list, not an error, when the edition serves none', async () => {
		const none = (async () => new Response('', { status: 404 })) as typeof fetch;
		expect(await loadLiveIndex('/workshop', none)).toEqual([]);
	});
});
