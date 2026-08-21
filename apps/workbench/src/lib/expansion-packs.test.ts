import { describe, expect, it } from 'vitest';
import { AGENT_BUILDER_BUNDLE, EXPANSION_PACKS } from './expansion-packs.js';

describe('the expansion-pack line', () => {
	it('gives every pack a unique id and no empty field', () => {
		const ids = EXPANSION_PACKS.map((pack) => pack.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const pack of EXPANSION_PACKS) {
			expect(pack.name.length).toBeGreaterThan(0);
			expect(pack.contents.length).toBeGreaterThan(0);
			expect(pack.teaches.length).toBeGreaterThan(0);
		}
	});

	/**
	 * The one invariant this file actually exists to guard: claiming a pack is
	 * "Unlocked!" when its own content does not exist anywhere in the packs
	 * would be exactly the kind of governance-tool dishonesty this app exists
	 * to teach against. `18-…` §4 scopes Tool Shop "E+ (content-only)" —
	 * unscheduled — and no measuring tape, camera or walkie-talkie tool has
	 * ever been built, so it is the one pack that must stay `coming-soon`
	 * until that changes.
	 */
	it('marks Tool Shop coming soon — its own content does not exist yet — and everything else unlocked', () => {
		const byId = new Map(EXPANSION_PACKS.map((pack) => [pack.id, pack.status]));
		expect(byId.get('tool-shop')).toBe('coming-soon');
		for (const [id, status] of byId) {
			if (id === 'tool-shop') continue;
			expect(status, id).toBe('unlocked');
		}
	});

	it('describes the bundle without empty fields', () => {
		expect(AGENT_BUILDER_BUNDLE.name.length).toBeGreaterThan(0);
		expect(AGENT_BUILDER_BUNDLE.contents.length).toBeGreaterThan(0);
		expect(AGENT_BUILDER_BUNDLE.teaches.length).toBeGreaterThan(0);
	});
});
