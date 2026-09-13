import { parseContentRecord } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { viewFromUrl, viewHref, viewsFor } from './views.js';

/** WP109 (`96-CONTROL-ROOM-V3.md` §2.2): a view is a URL — from one and back, under a lens. */
describe('saved views', () => {
	it('is a content record of the kind view, from the URL as it stands', () => {
		const view = viewFromUrl(
			'assurance',
			{ pathname: '/craft-a-bot/workshop/runs', search: '?outcome=FAILURE&bot=x' },
			'Failures, by bot',
			(pathname) => pathname.replace('/craft-a-bot', '')
		);
		expect(view.id).toBe('local/views/assurance-failures-by-bot');
		expect(view.kind).toBe('view');
		expect(parseContentRecord(view)).toEqual(view);
		expect(viewHref(view.record as { route: string; search: string })).toBe(
			'/workshop/runs?outcome=FAILURE&bot=x'
		);
	});

	it('refuses a URL outside the Workshop', () => {
		expect(() => viewFromUrl('engineer', { pathname: '/', search: '' }, 'Kit')).toThrow(
			/Workshop URL/
		);
	});

	it('lists a lens’s views by title, ignoring another lens’s and anything malformed', () => {
		const a = viewFromUrl('engineer', { pathname: '/workshop/runs', search: '' }, 'Zed');
		const b = viewFromUrl(
			'engineer',
			{ pathname: '/workshop/campaigns', search: '?baseline=x' },
			'Alpha'
		);
		const c = viewFromUrl('conduct', { pathname: '/workshop/conduct', search: '' }, 'Theirs');
		const bent = { ...a, id: 'local/views/bent', record: { nonsense: true } };
		expect(viewsFor([a, b, c, bent], 'engineer').map((view) => view.title)).toEqual([
			'Alpha',
			'Zed'
		]);
	});
});
