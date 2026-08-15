import { describe, expect, it } from 'vitest';
import { playroomLayouts } from '@craftabot/pack-starter';

import {
	ALL_ASSETS,
	BOT_FACES,
	BOT_POSES,
	CELL_HIGHLIGHT,
	CHARACTERS,
	CONFETTI_PARTICLE_IDS,
	CONTAINERS,
	FURNITURE,
	GRID,
	SCENE_ITEMS,
	SLOT_ORIGINS,
	SPARKLE_FRAME_IDS,
	TEMPLATES
} from './index.js';

/**
 * The art contract, as tests (`20-…` §7, `22-…` §1).
 *
 * These are not "does the file exist" checks. Wave 1's validator ran outside the
 * repo, so the guarantees it made — palette-only colour, slots present and
 * empty, hidden state layers, correct canvases — hold for the files as
 * delivered and for nothing afterwards. A hand-edit, a well-meaning SVGO pass in
 * a build step, or a re-export from Affinity can undo any of them silently, and
 * every one of those failures is invisible in a rendered screenshot.
 *
 * Two of them have already happened once during production and are worth naming:
 * SVGO's `removeHiddenElems` deleted the chest's open and locked states from a
 * file that still looked perfect, and the palette check could not see an
 * Affinity export at all because Affinity writes `rgb()` and the check greps
 * for hex.
 */

/** `20-…` §2 — the only colours permitted in a delivered SVG. */
const PALETTE = new Set([
	'#F3E9D2',
	'#EFE3C8',
	'#2B2620',
	'#5C5348',
	'#CFC4AB',
	'#2456A6',
	'#4E8A3C',
	'#6C4F9E',
	'#5484BB',
	'#C93A2E',
	'#E9B62F',
	'#3E8F8A',
	'#D77A3C',
	'#7A5C3E',
	'#C9705E',
	'#FFFFFF',
	'#000000'
]);

/** `20-…` §5 — the canvas each artefact is authored at, in px at 1×. */
const CANVAS: Record<string, [number, number]> = {
	'face-idle': [48, 48],
	'face-thinking': [48, 48],
	'face-happy': [48, 48],
	'face-confused': [48, 48],
	'face-celebrating': [48, 48],
	'face-stopped': [48, 48],
	'pose-walk': [96, 96],
	'pose-carry': [96, 96],
	backdrop: [768, 576],
	'toy-chest': [96, 96],
	shelf: [96, 96],
	table: [96, 96],
	'teddy-idle': [96, 96],
	'teddy-happy': [96, 96],
	'item-snack': [72, 72],
	'item-block-a': [72, 72],
	'item-block-b': [72, 72],
	'item-block-c': [72, 72],
	'item-red-key': [72, 72],
	'item-ball': [72, 72],
	'cell-highlight': [96, 96],
	'fx-denied-stamp': [192, 192],
	'fx-question-puff': [96, 96],
	'fx-confetti': [96, 96],
	'fx-sparkle': [48, 48],
	'fx-zzz': [96, 96],
	'box-sticker': [24, 24],
	'badge-rosette': [96, 96]
};

const hexes = (svg: string) => (svg.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((h) => h.toUpperCase());
const hasId = (svg: string, id: string) => new RegExp(`id="${id}"`).test(svg);

/**
 * A named artefact, or a failure that says which one is missing.
 *
 * `noUncheckedIndexedAccess` is on across the repo, and rightly: a lookup that
 * silently yields `undefined` is exactly how "the file is not there" turns into
 * "the picture is blank". Asking through here means a typo in a key fails as a
 * missing asset rather than as a confusing assertion further down.
 */
const assetOf = (map: Record<string, string>, key: string): string => {
	const svg = map[key];
	if (svg === undefined) throw new Error(`no asset delivered for "${key}"`);
	return svg;
};
/** The element carrying `id`, up to its closing bracket or self-close. */
const elementFor = (svg: string, id: string) =>
	new RegExp(`<(\\w+)[^>]*id="${id}"[^>]*?(/?)>`).exec(svg);

describe('wave 1 art', () => {
	it('delivers all 28 artefacts', () => {
		expect(Object.keys(ALL_ASSETS)).toHaveLength(28);
	});

	it.each(Object.entries(ALL_ASSETS))('%s is a single-root SVG at its §5 canvas', (name, svg) => {
		const canvas = CANVAS[name];
		// A delivered artefact this table has never heard of is a spec gap, not a
		// pass. `?? [0, 0]` here would turn one into the other.
		if (!canvas) throw new Error(`"${name}" has no §5 canvas on record`);
		const [w, h] = canvas;
		expect(svg).toContain(`viewBox="0 0 ${w} ${h}"`);
		expect(svg).toContain(`width="${w}"`);
		expect(svg).toContain(`height="${h}"`);
		// §3: no transform on the root, or every coordinate below it is a lie.
		expect(/^<svg[^>]*\btransform=/.test(svg)).toBe(false);
	});

	it.each(Object.entries(ALL_ASSETS))('%s uses only §2 palette colours', (_name, svg) => {
		expect(hexes(svg).filter((h) => !PALETTE.has(h))).toEqual([]);
	});

	it.each(Object.entries(ALL_ASSETS))('%s carries no editor metadata (§3)', (_name, svg) => {
		expect(svg).not.toContain('serif:');
		expect(svg).not.toContain('<!DOCTYPE');
		expect(svg).not.toContain('<?xml');
	});
});

describe('the id → asset mapping', () => {
	/**
	 * The world the pack actually builds is the source of truth — not a list of
	 * names, and not a list kept here. Checked across every layout, because an
	 * item that only appears in `locked-chest` is still an item that has to be
	 * drawable. If someone adds a thing to the Playroom and no art, this fails
	 * rather than the grid drawing a bullet point while the trace describes
	 * something that is not on screen.
	 */
	const inWorld = new Set<string>();
	const nameById = new Map<string, string>();
	for (const layout of playroomLayouts) {
		const state = layout.initialState as {
			furniture: { id: string }[];
			containers: { id: string }[];
			characters: { id: string }[];
			items: { id: string; name: string }[];
		};
		for (const f of state.furniture) inWorld.add(f.id);
		for (const c of state.containers) inWorld.add(c.id);
		for (const c of state.characters) inWorld.add(c.id);
		for (const i of state.items) {
			inWorld.add(i.id);
			nameById.set(i.id, i.name);
		}
	}

	const drawn = new Set([
		...Object.keys(SCENE_ITEMS),
		...Object.keys(FURNITURE),
		...Object.keys(CONTAINERS),
		...Object.keys(CHARACTERS)
	]);

	it('covers every entity the Playroom places', () => {
		expect([...inWorld].filter((id) => !drawn.has(id)).sort()).toEqual([]);
	});

	it('draws nothing the Playroom does not place', () => {
		expect([...drawn].filter((id) => !inWorld.has(id)).sort()).toEqual([]);
	});

	it('gives every bot expression a face', () => {
		// Keys are typed against BotExpression, so this guards the runtime map
		// rather than the type — an import that resolved to undefined still
		// type-checks.
		for (const [name, svg] of Object.entries(BOT_FACES)) {
			expect(svg, name).toMatch(/^<svg/);
		}
		expect(Object.keys(BOT_FACES)).toHaveLength(6);
	});

	it('draws the blue block with an A on it', () => {
		// The 2026-08-12 bug, as a test: block-a is blue and carries "A", and the
		// pack says so in words. Colour and letter both, because either alone has
		// been wrong before.
		expect(nameById.get('block-a')).toContain('blue');
		expect(nameById.get('block-a')).toContain('(A)');
		expect(hexes(assetOf(SCENE_ITEMS, 'block-a'))).toContain('#2456A6');
		expect(hexes(assetOf(SCENE_ITEMS, 'block-b'))).toContain('#E9B62F');
		expect(hexes(assetOf(SCENE_ITEMS, 'block-c'))).toContain('#C93A2E');
	});

	it('keeps ink on the yellow block', () => {
		// §2's forbidden pairs: white on --cab-yellow fails contrast. B is the
		// block where that bites, so its letter is ink and not cream.
		expect(hexes(assetOf(SCENE_ITEMS, 'block-b'))).toContain('#2B2620');
		expect(hexes(assetOf(SCENE_ITEMS, 'block-b'))).not.toContain('#F3E9D2');
	});
});

describe('the named-group contract (§7.11)', () => {
	it('gives both poses an empty #face-slot at the same origin', () => {
		for (const [pose, svg] of Object.entries(BOT_POSES)) {
			expect(hasId(svg, 'face-slot'), pose).toBe(true);
			// Empty means empty: the app appends the expression into it.
			expect(svg, pose).toMatch(/<g[^>]*id="face-slot"[^>]*\/>|<g[^>]*id="face-slot"[^>]*><\/g>/);
			const { x, y } = SLOT_ORIGINS['face-slot'];
			expect(svg, pose).toContain(`translate(${x} ${y})`);
		}
	});

	it('gives pose-carry an #icon-slot for the carried item', () => {
		const { x, y } = SLOT_ORIGINS['icon-slot'];
		expect(hasId(BOT_POSES.carry, 'icon-slot')).toBe(true);
		expect(BOT_POSES.carry).toContain(`translate(${x} ${y})`);
	});

	it('leaves #emboss empty on the rosette — the chapter count is not baked', () => {
		expect(hasId(TEMPLATES.badgeRosette, 'emboss')).toBe(true);
		expect(TEMPLATES.badgeRosette).toMatch(
			/<g[^>]*id="emboss"[^>]*\/>|<g[^>]*id="emboss"[^>]*><\/g>/
		);
		// Seven chapters as of WP17, and it must not matter.
		expect(TEMPLATES.badgeRosette).not.toMatch(/>\s*[1-9]\s*</);
	});

	it('exposes --part-tint with a literal fallback on both templates', () => {
		for (const [name, svg] of [...Object.entries(TEMPLATES), ['cellHighlight', CELL_HIGHLIGHT]] as [
			string,
			string
		][]) {
			const m = /fill="var\(--part-tint,\s*(#[0-9A-F]{6})\)"/.exec(svg);
			expect(m, `${name} has no tintable #tint fill`).not.toBeNull();
			// The fallback is what renders before any CSS is written, so it has to
			// be a real token rather than a placeholder.
			expect(PALETTE.has(m![1]!), `${name} fallback ${m![1]}`).toBe(true);
		}
	});
});

describe('baked state layers', () => {
	/**
	 * These ship hidden and are switched on by the app. SVGO's `removeHiddenElems`
	 * deletes them by default — it happened during production — and the file
	 * still renders perfectly with two thirds of the chest missing.
	 */
	const hidden = (svg: string, id: string) => {
		const el = elementFor(svg, id);
		expect(el, `#${id} is missing`).not.toBeNull();
		expect(el![0], `#${id} should ship hidden`).toContain('display="none"');
	};

	it('ships the chest closed, with open and locked present but dark', () => {
		const chest = assetOf(CONTAINERS, 'toy-chest');
		expect(hasId(chest, 'state-closed')).toBe(true);
		expect(elementFor(chest, 'state-closed')![0]).not.toContain('display="none"');
		hidden(chest, 'state-open');
		hidden(chest, 'state-locked');
	});

	it('ships the sparkle showing one frame', () => {
		const [first, ...rest] = SPARKLE_FRAME_IDS;
		expect(elementFor(assetOf(ALL_ASSETS, 'fx-sparkle'), first!)![0]).not.toContain(
			'display="none"'
		);
		for (const id of rest) hidden(assetOf(ALL_ASSETS, 'fx-sparkle'), id);
	});

	it('ships the rosette unearned', () => {
		hidden(TEMPLATES.badgeRosette, 'state-earned');
	});

	it('gives the confetti twelve individually addressable particles', () => {
		for (const id of CONFETTI_PARTICLE_IDS) {
			expect(hasId(assetOf(ALL_ASSETS, 'fx-confetti'), id), id).toBe(true);
		}
		// Static-first (§7.10): the particles are scattered as delivered, so the
		// effect still means something under prefers-reduced-motion. Twelve pieces
		// stacked at the origin waiting for a transform would be a pile, not a
		// burst — and would pass every other check in this file.
		const origins = CONFETTI_PARTICLE_IDS.map((id) => {
			const g = new RegExp(`<g id="${id}">(.*?)</g>`).exec(assetOf(ALL_ASSETS, 'fx-confetti'));
			const first = /(?:\bd="[Mm]\s*|\bcx=")(-?[\d.]+)/.exec(g?.[1] ?? '');
			return first ? Number(first[1]) : NaN;
		}).filter((n) => !Number.isNaN(n));
		expect(origins).toHaveLength(12);
		expect(Math.max(...origins) - Math.min(...origins)).toBeGreaterThan(48);
	});
});

describe('the backdrop and the grid', () => {
	it('is drawn for the 8 × 6 Playroom', () => {
		// Confirmed 2026-08-15 (`20-…` §8.4). The backdrop is the only asset that
		// hard-codes the grid; every other file is cell-local. If GRID changes,
		// this fails and backdrop.svg is the work.
		expect(GRID).toEqual({ cols: 8, rows: 6, cell: 96 });
		expect(assetOf(ALL_ASSETS, 'backdrop')).toContain(
			`viewBox="0 0 ${GRID.cols * GRID.cell} ${GRID.rows * GRID.cell}"`
		);
	});

	it('stays inside the §3 scene budget', () => {
		expect(assetOf(ALL_ASSETS, 'backdrop').length).toBeLessThanOrEqual(80_000);
	});

	it('keeps every part inside the §3 part budget', () => {
		for (const [name, svg] of Object.entries(ALL_ASSETS)) {
			if (name === 'backdrop') continue;
			expect(svg.length, name).toBeLessThanOrEqual(30_000);
		}
	});
});
