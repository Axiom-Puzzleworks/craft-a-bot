import type { PackManifest } from '@craftabot/core';
import { packs as builtPacks } from '$edition-packs';
import { base } from '$app/paths';
import { EDITION_MODE, EDITION_PACK_IDS, editionId, type EditionId } from './edition-id.js';
import { EXPANSION_PACKS, type ExpansionPack } from './expansion-packs.js';

/**
 * **Editions** (`59-EDITIONS.md` §4.1, WP69; `41-…` §6.14, decision D3): one
 * codebase, three sections of a site — decided at build time from
 * `CAB_EDITION` and never at run time. `full` is the app exactly as it has
 * always been and is what `npm run build`, `npm run dev` and every test use;
 * the three named editions are additional folders (`npm run build:editions`),
 * each with its own packs, route allow-list, shelf and budget. Nothing here
 * reads `localStorage`, a query string or a hostname.
 */

export type { EditionId } from './edition-id.js';

export interface Edition {
	id: EditionId;
	title: string;
	/** `kit.paths.base` for this edition — `''` for `full`. */
	base: string;
	/** The packs this box holds, by id (`edition-id.ts`); the manifests of the *built* edition are `edition.packs`. */
	packIds: readonly string[];
	/** Over the route path with the base stripped (`routePath`). */
	routes: { allow: RegExp[] };
	/** The default `data-mode`, and whether the Workshop door starts open. */
	mode: 'kit' | 'workshop';
	/** What the Kit's shelf shows — a pack that lives in another section says so and links there. */
	shelf: ExpansionPack[];
	budgetBytes: number;
}

const EVERYTHING = [/.*/];
const NOT_WORKSHOP = [/^(?!\/workshop(\/|$)).*/];
const NOT_PLAYGROUND = [/^(?!\/workshop\/playground(\/|$)).*/];

/** The shelf with the Playground's box marked as living in another section. */
function shelfFor(playgroundHere: boolean): ExpansionPack[] {
	return EXPANSION_PACKS.map((pack) =>
		pack.id === 'retail-bank-playground' && !playgroundHere
			? { ...pack, status: 'in-another-edition', href: '/playground/' }
			: { ...pack }
	);
}

export const EDITIONS: Record<EditionId, Edition> = {
	simulator: {
		id: 'simulator',
		title: 'Craft A Bot',
		base: '/simulator',
		packIds: EDITION_PACK_IDS.simulator,
		routes: { allow: NOT_WORKSHOP },
		mode: EDITION_MODE.simulator,
		shelf: shelfFor(false),
		budgetBytes: 1_740_000 // +15 kB 2026-09-07 (WP73): the wave 2 placeholders inlined as markup; +25 kB the same day (the UX pass); +10 kB 2026-09-10 (WP79): core's workflow types and events; +260 kB 2026-09-11 (WP91, `81-…` §4): the Day 5 Workshop screens — every route's chunk ships in every edition, only the packs differ, and the budget had not followed since WP84
	},
	workshop: {
		id: 'workshop',
		title: 'The Workshop',
		base: '/workshop',
		packIds: EDITION_PACK_IDS.workshop,
		routes: { allow: NOT_PLAYGROUND },
		mode: EDITION_MODE.workshop,
		shelf: shelfFor(false),
		budgetBytes: 1_760_000 // +25 kB 2026-09-07 (the UX pass): the rack's grouping, the campaign picker, the cases tools; +50 kB 2026-09-10 (WP74): the calibration table's cited rows; +20 kB 2026-09-11 (WP80): the Books and Sweeps panels, the human-load pane, the campaign's book source; +20 kB 2026-09-11 (WP81): the bank's ontology and the graph line; +10 kB 2026-09-11 (WP82): the report v3's panes; +40 kB 2026-09-11 (WP84): the Monitor page and the fold; +20 kB 2026-09-11 (WP85): the fraud and advice workflows; +30 kB 2026-09-11 (WP86): the Workflows list, the Pipeline and the Boundary's layout engine; +20 kB 2026-09-11 (WP87): the lenses, the guided strip, the Assurance entry and Compare for reports; +75 kB 2026-09-11 (WP91, `81-…` §4): the Conduct, Model-risk and Experiments screens, which the budget had not followed
	},
	playground: {
		id: 'playground',
		title: 'Retail Financial Services Playground',
		base: '/playground',
		packIds: EDITION_PACK_IDS.playground,
		routes: { allow: EVERYTHING },
		mode: EDITION_MODE.playground,
		shelf: shelfFor(true),
		budgetBytes: 1_810_000 // +15 kB 2026-09-07 (WP73): the wave 2 placeholders inlined as markup; +25 kB the same day (the UX pass); +50 kB 2026-09-10 (WP74): the calibration table's cited rows; +20 kB 2026-09-11 (WP80): the lending workflow, the Books and Sweeps panels, the human-load pane; +20 kB 2026-09-11 (WP81): the bank's ontology and the graph line; +10 kB 2026-09-11 (WP82): the report v3's panes; +40 kB 2026-09-11 (WP84): the Monitor page and the fold; +20 kB 2026-09-11 (WP85): the fraud and advice workflows; +30 kB 2026-09-11 (WP86): the Workflows list, the Pipeline and the Boundary's layout engine; +20 kB 2026-09-11 (WP87): the lenses; +40 kB 2026-09-11 (WP88): the Conduct and Model-risk pages and the validation suite; +40 kB 2026-09-11 (WP89): the Experiments page and the experiment module; +15 kB 2026-09-11 (WP91): headroom re-stated
	},
	full: {
		id: 'full',
		title: 'Craft A Bot',
		base: '',
		packIds: EDITION_PACK_IDS.full,
		routes: { allow: EVERYTHING },
		mode: EDITION_MODE.full,
		shelf: shelfFor(true),
		budgetBytes: 1_800_000 // +25 kB 2026-09-07 (the UX pass); +50 kB 2026-09-10 (WP74): the calibration table's cited rows; +20 kB 2026-09-11 (WP80): the lending workflow, the Books and Sweeps panels, the human-load pane; +20 kB 2026-09-11 (WP81): the bank's ontology and the graph line; +10 kB 2026-09-11 (WP82): the report v3's panes; +40 kB 2026-09-11 (WP84): the Monitor page and the fold; +20 kB 2026-09-11 (WP85): the fraud and advice workflows; +30 kB 2026-09-11 (WP86): the Workflows list, the Pipeline and the Boundary's layout engine; +20 kB 2026-09-11 (WP87): the lenses; +40 kB 2026-09-11 (WP88): the Conduct and Model-risk pages and the validation suite; +40 kB 2026-09-11 (WP89): the Experiments page and the experiment module; +20 kB 2026-09-11 (WP91): headroom re-stated
	}
};

export { isEditionId } from './edition-id.js';

/** The edition this bundle was built as — `CAB_EDITION` at build, `full` by default — with its packs. */
export const edition: Edition & { packs: PackManifest[] } = {
	...EDITIONS[editionId],
	packs: builtPacks
};

/** The pathname with this edition's `base` stripped, so route checks read the app's own path. */
export function routePath(pathname: string, editionBase: string = base): string {
	if (editionBase !== '' && pathname.startsWith(editionBase)) {
		const rest = pathname.slice(editionBase.length);
		return rest === '' ? '/' : rest;
	}
	return pathname;
}

export function allowsRoute(target: Edition, path: string): boolean {
	return target.routes.allow.some((pattern) => pattern.test(path));
}

/** The smallest section that has this route — the link a "not in this box" page offers. */
export function sectionFor(path: string): Edition | undefined {
	for (const id of ['simulator', 'workshop', 'playground'] as const) {
		if (allowsRoute(EDITIONS[id], path)) return EDITIONS[id];
	}
	return undefined;
}

/** The smallest section whose box holds every one of these packs. */
export function editionWithPacks(packIds: readonly string[]): Edition | undefined {
	for (const id of ['simulator', 'workshop', 'playground'] as const) {
		const held = new Set(EDITIONS[id].packIds);
		if (packIds.every((packId) => held.has(packId))) return EDITIONS[id];
	}
	return undefined;
}
