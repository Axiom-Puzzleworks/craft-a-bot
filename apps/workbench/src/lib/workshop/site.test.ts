import { describe, expect, it } from 'vitest';
import { SITE_FRAMING_PAGE, SITE_WORKSPACE_PAGE, servedFromSite } from './site.js';

/** The site affordance (WP93): true only under a base on the site's own hosts; the two pages are on the site. */
describe('servedFromSite', () => {
	it('is true for a section on the site and false everywhere else', () => {
		expect(servedFromSite('axiom-verity.com', '/workshop')).toBe(true);
		expect(servedFromSite('WWW.axiom-verity.com', '/playground')).toBe(true);
		expect(servedFromSite('axiom-verity.com', '')).toBe(false);
		expect(servedFromSite('localhost', '/workshop')).toBe(false);
		expect(servedFromSite('example.org', '/simulator')).toBe(false);
		expect(servedFromSite('evil-axiom-verity.com', '/simulator')).toBe(false);
	});

	it('names the site’s pages', () => {
		expect(SITE_FRAMING_PAGE).toMatch(/^https:\/\/axiom-verity\.com\//);
		expect(SITE_WORKSPACE_PAGE).toMatch(/^https:\/\/axiom-verity\.com\//);
	});
});
