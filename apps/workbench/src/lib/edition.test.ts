import { describe, expect, it } from 'vitest';
import {
	EDITIONS,
	allowsRoute,
	edition,
	editionWithPacks,
	routePath,
	sectionFor
} from './edition.js';
import { EDITION_PACK_IDS, editionId } from './edition-id.js';
import { installedPacks } from './packs.js';

/**
 * Editions (WP69, `59-EDITIONS.md` §4.1): the test build is `full`, whose
 * packs are exactly the ids the table names; the allow-lists, `routePath`
 * under a base, and the two lookups the shelf, the guard and the import use.
 */
describe('editions', () => {
	it('is full in tests, with every pack the table names and nothing else', () => {
		expect(editionId).toBe('full');
		expect(edition.id).toBe('full');
		expect(edition.base).toBe('');
		expect(installedPacks).toBe(edition.packs);
		expect(installedPacks.map((pack) => pack.id).sort()).toEqual([...EDITION_PACK_IDS.full].sort());
		// Every box's ids are ids full holds — the table cannot name a pack that does not exist.
		for (const ids of Object.values(EDITION_PACK_IDS)) {
			for (const id of ids) expect(EDITION_PACK_IDS.full).toContain(id);
		}
	});

	it('strips the base from a pathname and leaves full alone', () => {
		expect(routePath('/workshop/workshop/runs', '/workshop')).toBe('/workshop/runs');
		expect(routePath('/workshop', '/workshop')).toBe('/');
		expect(routePath('/simulator/settings', '/simulator')).toBe('/settings');
		expect(routePath('/settings', '')).toBe('/settings');
		expect(routePath('/settings')).toBe('/settings');
	});

	it('allows the Kit everywhere, the Workshop outside the simulator, the Playground only where the desks are', () => {
		expect(allowsRoute(EDITIONS.simulator, '/')).toBe(true);
		expect(allowsRoute(EDITIONS.simulator, '/bench/abc')).toBe(true);
		expect(allowsRoute(EDITIONS.simulator, '/workshop')).toBe(false);
		expect(allowsRoute(EDITIONS.simulator, '/workshop/runs')).toBe(false);
		expect(allowsRoute(EDITIONS.simulator, '/workshopish')).toBe(true);
		expect(allowsRoute(EDITIONS.workshop, '/workshop/runs')).toBe(true);
		expect(allowsRoute(EDITIONS.workshop, '/workshop/playground')).toBe(false);
		expect(allowsRoute(EDITIONS.workshop, '/workshop/playground/advice')).toBe(false);
		expect(allowsRoute(EDITIONS.playground, '/workshop/playground/advice')).toBe(true);
		expect(allowsRoute(EDITIONS.full, '/workshop/playground/advice')).toBe(true);
	});

	it('names the smallest section that has a route or a set of packs', () => {
		expect(sectionFor('/')?.id).toBe('simulator');
		expect(sectionFor('/workshop/runs')?.id).toBe('workshop');
		expect(sectionFor('/workshop/playground/fraud')?.id).toBe('playground');
		expect(editionWithPacks(['starter', 'openai'])?.id).toBe('simulator');
		expect(editionWithPacks(['starter', 'geap'])?.id).toBe('workshop');
		expect(editionWithPacks(['fs-advice'])?.id).toBe('playground');
		expect(editionWithPacks(['nowhere'])).toBeUndefined();
	});

	it('marks the Playground box as in another edition where the desks are not', () => {
		const row = (id: keyof typeof EDITIONS) =>
			EDITIONS[id].shelf.find((pack) => pack.id === 'retail-bank-playground');
		expect(row('simulator')).toMatchObject({ status: 'in-another-edition', href: '/playground/' });
		expect(row('workshop')).toMatchObject({ status: 'in-another-edition' });
		expect(row('playground')).toMatchObject({ status: 'unlocked' });
		expect(row('full')).toMatchObject({ status: 'unlocked' });
		expect(EDITIONS.simulator.mode).toBe('kit');
		expect(EDITIONS.workshop.mode).toBe('workshop');
	});
});
