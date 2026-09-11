/**
 * **Served from the site** (WP93's craft-a-bot half, `82-SERVED-AND-GATED.md`
 * §3; `64-…` §6.9.2): the simulator may *notice* it is one of the site's
 * sections — served under an edition's base from the site's origin — and
 * offer the member's evidence-store workspace. An affordance, not a
 * dependency: every screen works unchanged with the offer declined, and
 * nothing here reads a session or a key.
 */
export const SITE_HOSTS: readonly string[] = ['axiom-verity.com', 'www.axiom-verity.com'];

/** The framing page the site keeps beside the thought experiment (`64-…` §6.9.3). */
export const SITE_FRAMING_PAGE = 'https://axiom-verity.com/thought-experiment/simulator';

/** Where a signed-in member mints the workspace token the simulator's Evidence screen can use. */
export const SITE_WORKSPACE_PAGE = 'https://axiom-verity.com/account';

/** True when the app is one of the site's sections: a base (`/simulator`, …) under one of the site's hosts. */
export function servedFromSite(hostname: string, base: string): boolean {
	if (base === '') return false;
	const host = hostname.toLowerCase();
	return SITE_HOSTS.some((site) => host === site);
}
