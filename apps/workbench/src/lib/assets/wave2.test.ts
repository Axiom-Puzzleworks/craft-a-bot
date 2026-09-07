import { describe, expect, it } from 'vitest';
import { FINISHES, FINISH_PROPERTIES } from './finishes.js';
import { TEMPLATES } from './index.js';
import { INSTRUMENT_ICONS, INSTRUMENT_IDS } from './instruments.js';

/**
 * The wave 2 contract, as tests (WP73, `63-ART-COMMISSION-BRIEF-WAVE-2.md`
 * §7): the placeholders must pass it today so the commissioned files pass it
 * by replacement. The same checks `assets.test.ts` holds over wave 1 —
 * canvas, palette, no metadata — plus wave 2's own: a tintable `#disc` and a
 * `#glyph` on every roundel, a `#tint` and an empty `#emboss` on the box, the
 * finishes tileable at their stated size.
 */
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

const WAVE_2: Record<string, { svg: string; canvas: [number, number] }> = {
	...Object.fromEntries(
		INSTRUMENT_IDS.map((id) => [`icon-${id}`, { svg: INSTRUMENT_ICONS[id], canvas: [96, 96] }])
	),
	'finish-graph': { svg: FINISHES.graph, canvas: [16, 16] },
	'finish-metal': { svg: FINISHES.metal, canvas: [64, 64] },
	'box-playground': { svg: TEMPLATES.boxPlayground, canvas: [96, 96] }
};

const hexes = (svg: string) => (svg.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((h) => h.toUpperCase());
const elementFor = (svg: string, id: string) =>
	new RegExp(`<(\\w+)[^>]*id="${id}"[^>]*?(/?)>`).exec(svg);

describe('wave 2 art (placeholders until the commission lands)', () => {
	it('delivers eleven icons, two finishes and one box — fourteen files', () => {
		expect(Object.keys(WAVE_2)).toHaveLength(14);
		expect(INSTRUMENT_IDS).toEqual([
			'meter',
			'lamp',
			'tape',
			'matrix',
			'chain',
			'case',
			'desk',
			'deck',
			'cassette',
			'cohort',
			'boundary'
		]);
	});

	it.each(Object.entries(WAVE_2))(
		'%s is a single-root SVG at its §5 canvas',
		(_name, { svg, canvas }) => {
			const [w, h] = canvas;
			expect(svg).toContain(`viewBox="0 0 ${w} ${h}"`);
			expect(svg).toContain(`width="${w}"`);
			expect(svg).toContain(`height="${h}"`);
			expect(/^<svg[^>]*\btransform=/.test(svg)).toBe(false);
			expect(svg).not.toContain('<?xml');
			expect(svg).not.toContain('<!DOCTYPE');
			expect(svg).not.toContain('serif:');
			expect(svg).not.toMatch(/rgb\(/);
		}
	);

	it.each(Object.entries(WAVE_2))('%s uses only §2 palette colours', (_name, { svg }) => {
		expect(hexes(svg).filter((h) => !PALETTE.has(h))).toEqual([]);
	});

	it.each(INSTRUMENT_IDS)(
		'icon-%s has a tintable #disc and a #glyph that draws something',
		(id) => {
			const svg = INSTRUMENT_ICONS[id];
			const disc = elementFor(svg, 'disc');
			expect(disc?.[0]).toMatch(/fill="var\(--part-tint, #3E8F8A\)"/);
			const glyph = /<g[^>]*id="glyph"[^>]*>([\s\S]*?)<\/g>/.exec(svg);
			expect(glyph?.[1]?.trim().length ?? 0).toBeGreaterThan(0);
			// Cream on the disc, never colour alone against it: the glyph is a stroke or a fill in #F3E9D2.
			expect(glyph?.[0]).toContain('#F3E9D2');
		}
	);

	it('the Playground box carries a tintable #tint and an empty #emboss', () => {
		const svg = TEMPLATES.boxPlayground;
		expect(elementFor(svg, 'tint')?.[0]).toMatch(/fill="var\(--part-tint, #3E8F8A\)"/);
		expect(svg).toMatch(/<g id="emboss"\/>/);
	});

	it('the finishes become url() properties a stylesheet can paint with', () => {
		expect(FINISH_PROPERTIES['--cab-finish-graph']).toMatch(/^url\("data:image\/svg\+xml,/);
		expect(FINISH_PROPERTIES['--cab-finish-metal']).toMatch(/^url\("data:image\/svg\+xml,/);
		// No raw double quote survives inside the url("…") — it would end the string.
		for (const value of Object.values(FINISH_PROPERTIES)) {
			expect(value.slice(5, -2)).not.toContain('"');
		}
	});
});
