import { describe, expect, it } from 'vitest';
import {
	LENSES,
	LENS_IDS,
	RAIL_LABELS,
	VOCABULARY_TERMS,
	lensById,
	railLabel,
	speak,
	vocab
} from './lens.js';

/**
 * The lenses' promises (WP87, `78-LENSES.md` §3): four ship, each with an
 * entry, a rail that names every destination once, three guided steps and
 * a vocabulary that answers every term; the engineer's lens is the rail as
 * it was; an unknown id is the engineer's; a sentence speaks in the lens's
 * words.
 */
describe('the lenses', () => {
	it('ship four, each naming every rail destination exactly once, in groups', () => {
		expect(LENSES.map((lens) => lens.id)).toEqual([...LENS_IDS]);
		for (const lens of LENSES) {
			const ids = lens.rail.flatMap((group) => group.routes);
			expect(new Set(ids).size, lens.id).toBe(ids.length);
			expect([...ids].sort(), lens.id).toEqual(Object.keys(RAIL_LABELS).sort());
			expect(lens.firstRun, lens.id).toHaveLength(3);
			expect(lens.entry.startsWith('/'), lens.id).toBe(true);
			for (const group of lens.rail)
				expect(group.routes.length, `${lens.id} ${group.group}`).toBeGreaterThan(0);
		}
	});

	it('answers every vocabulary term under every lens with a word, never nothing', () => {
		for (const lens of LENSES) {
			for (const term of VOCABULARY_TERMS) {
				const word = vocab(lens, term);
				expect(word.trim().length, `${lens.id}: ${term}`).toBeGreaterThan(0);
			}
			for (const [term, word] of Object.entries(lens.vocabulary)) {
				expect(
					(VOCABULARY_TERMS as readonly string[]).includes(term),
					`${lens.id} maps an unknown term ${term}`
				).toBe(true);
				expect(word.trim().length, `${lens.id}: ${term}`).toBeGreaterThan(0);
			}
		}
	});

	it('keeps the engineer’s rail in its order with its labels, and falls back to it for an unknown id', () => {
		const engineer = lensById('engineer');
		expect(engineer.rail).toHaveLength(1);
		expect(engineer.rail[0]?.routes[0]).toBe('dashboard');
		expect(railLabel(engineer, 'campaigns')).toBe('Campaigns');
		expect(lensById('nobody').id).toBe('engineer');
		expect(lensById(undefined).id).toBe('engineer');
	});

	it('speaks a sentence in the lens’s words', () => {
		const assurance = lensById('assurance');
		expect(speak(assurance, '{trips} over {cells}')).toBe('control interventions over cases');
		expect(speak(lensById('engineer'), '{trips} over {cells}')).toBe('trips over cells');
		expect(railLabel(assurance, 'campaigns')).toBe('Trials');
		expect(railLabel(lensById('conduct'), 'incidents')).toBe('Treatment failures');
	});
});
