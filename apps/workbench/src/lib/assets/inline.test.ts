import { describe, expect, it } from 'vitest';
import { inlineSvg } from './inline.js';
import { ALL_ASSETS, BOT_FACES, BOT_POSES, CONTAINERS, SCENE_ITEMS, TEMPLATES } from './index.js';

/**
 * The translation from the delivery contract to the runtime one.
 *
 * `assets.test.ts` guards the files as they are shipped — ids present, layers
 * hidden, palette clean. This guards what happens to them on the way onto a
 * page, which is where the two ways this can break silently live: an id that
 * survives into a document seven times over, and a state layer that is *there*
 * but painting the wrong one.
 */

const nonEmptySlot = '<circle cx="1" cy="1" r="1"/>';

describe('ids become data-parts', () => {
	it('leaves no id on any asset once inlined', () => {
		for (const [name, svg] of Object.entries(ALL_ASSETS)) {
			expect(inlineSvg(svg), name).not.toMatch(/\bid="/);
		}
	});

	it('keeps every name, so the code interface survives the rename', () => {
		const inlined = inlineSvg(CONTAINERS['toy-chest'] as string);
		for (const part of ['state-closed', 'state-open', 'state-locked', 'carcass']) {
			expect(inlined).toContain(`data-part="${part}"`);
		}
	});

	it('refuses an asset that refers to one of its own ids', () => {
		// A gradient, a clip path or a <use> would render *almost* right after the
		// rename, which is the failure worth being loud about. Wave 1 has none;
		// a later wave might.
		const gradient =
			'<svg viewBox="0 0 8 8"><linearGradient id="g"/><rect fill="url(#g)" width="8" height="8"/></svg>';
		expect(() => inlineSvg(gradient)).toThrow(/refers to one of its own ids/);
	});

	it('lets the same asset be inlined many times over', () => {
		// Seven rosettes on the badge sheet, six stickers on the shelf. This is
		// the whole reason the rename exists.
		const sheet = [1, 2, 3].map(() => inlineSvg(TEMPLATES.badgeRosette)).join('');
		expect(sheet).not.toMatch(/\bid="/);
		expect(sheet.match(/data-part="emboss"/g)).toHaveLength(3);
	});
});

describe('variants', () => {
	const chest = CONTAINERS['toy-chest'] as string;

	it.each(['closed', 'open', 'locked'])('paints only #state-%s', (state) => {
		const inlined = inlineSvg(chest, { variants: { state } });
		for (const other of ['closed', 'open', 'locked']) {
			const group = new RegExp(`<g[^>]*data-part="state-${other}"[^>]*>`).exec(inlined);
			expect(group, `state-${other}`).not.toBeNull();
			expect(group![0].includes('display="none"'), `state-${other}`).toBe(other !== state);
		}
	});

	it('unhides a layer the file ships dark', () => {
		// `open` and `locked` arrive with `display="none"` baked in, so choosing
		// them is not a matter of hiding the others.
		expect(inlineSvg(chest, { variants: { state: 'open' } })).toMatch(/<g data-part="state-open">/);
	});

	it('hides them all when nothing matches — the unearned rosette', () => {
		const inlined = inlineSvg(TEMPLATES.badgeRosette, { variants: { state: 'none' } });
		expect(inlined).toMatch(/<g[^>]*data-part="state-earned"[^>]*display="none"/);
	});

	it('is loud when there is no such group', () => {
		expect(() => inlineSvg(chest, { variants: { frame: '1' } })).toThrow(/no #frame-\*/);
	});
});

describe('slots', () => {
	it('nests a face inside a pose at the slot origin', () => {
		const face = inlineSvg(BOT_FACES.happy, { size: 48 });
		const bot = inlineSvg(BOT_POSES.walk, { slots: { 'face-slot': face } });

		// The origin is the file's own transform, never a number repeated here —
		// that is what stops the two poses from drifting apart.
		expect(bot).toMatch(/<g data-part="face-slot" transform="translate\(24 14\)">\s*<svg/);
		expect(bot).toContain('data-part="mouth"');
	});

	it('sizes nested content, because a slot gives it no CSS box to fill', () => {
		const item = inlineSvg(SCENE_ITEMS['block-a'] as string, { size: 48 });
		expect(item).toContain('width="48"');
		expect(item).toContain('height="48"');
		// The viewBox is untouched, so the 72 px drawing scales rather than crops.
		expect(item).toContain('viewBox="0 0 72 72"');
	});

	it('strips the root size when there is none given, so CSS owns the scene', () => {
		const room = inlineSvg(ALL_ASSETS.backdrop as string);
		expect(/^<svg[^>]*\swidth=/.test(room)).toBe(false);
		expect(room).toContain('viewBox="0 0 768 576"');
	});

	it('survives path data that looks like a substitution pattern', () => {
		// `$&` in a replacement string is not a thing anybody would notice until a
		// path happened to contain one.
		const filled = inlineSvg(BOT_POSES.carry, {
			slots: { 'icon-slot': '<path d="M0 0h1v1H0z"/>' }
		});
		expect(filled).toContain('<path d="M0 0h1v1H0z"/>');
	});

	it('is loud when the slot is missing', () => {
		expect(() => inlineSvg(BOT_POSES.walk, { slots: { 'icon-slot': nonEmptySlot } })).toThrow(
			/no empty #icon-slot/
		);
	});
});

describe('the root', () => {
	it('is decorative unless the caller says otherwise', () => {
		const inlined = inlineSvg(BOT_FACES.idle);
		expect(inlined).toContain('aria-hidden="true"');
		expect(inlined).toContain('focusable="false"');
	});

	it('takes a role and a label when the picture is the information', () => {
		const inlined = inlineSvg(BOT_FACES.idle, {
			attrs: { 'aria-hidden': undefined, role: 'img', 'aria-label': 'Your bot is waiting' }
		});
		expect(inlined).not.toContain('aria-hidden');
		expect(inlined).toContain('role="img"');
		expect(inlined).toContain('aria-label="Your bot is waiting"');
	});

	it('never sets the same attribute twice', () => {
		const inlined = inlineSvg(ALL_ASSETS['fx-sparkle'] as string, { size: 24 });
		const root = /^<svg[^>]*>/.exec(inlined)![0];
		expect(root.match(/\swidth=/g)).toHaveLength(1);
		expect(root.match(/\sheight=/g)).toHaveLength(1);
	});
});
