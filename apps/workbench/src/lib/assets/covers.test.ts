import { journeyLayout } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '$lib/packs.js';
import { COVER_HEIGHT, COVER_WIDTH, DELIVERED, coverFor, placeholderCover } from './covers.js';

/**
 * WP109 (`96-CONTROL-ROOM-V3.md` §4): a cover per shipped journey, drawn
 * from the journey's own layout, deterministic, to the brief's contract
 * (palette colours only, `#tint` tintable); the delivered seam empty until
 * the commission lands.
 */
const registry = createRegistry();
const subjects = registry.listWorkflows().map((workflow) => {
	const layout = journeyLayout(workflow, undefined, undefined, { registry });
	return {
		id: workflow.id,
		name: workflow.name,
		lanes: layout.lanes.map((lane) => lane.label),
		stages: layout.nodes.length
	};
});

describe('journey covers', () => {
	it('draws one per shipped journey, no two alike, the same twice', () => {
		expect(subjects.length).toBeGreaterThanOrEqual(8);
		const covers = subjects.map((subject) => coverFor(subject));
		expect(new Set(covers).size).toBe(covers.length);
		expect(subjects.map((subject) => coverFor(subject))).toEqual(covers);
		for (const [index, cover] of covers.entries()) {
			expect(cover).toMatch(new RegExp(`^<svg [^>]*viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}"`));
			expect(cover).toContain(`aria-label="${subjects[index]!.name.replace(/&/g, '&amp;')}"`);
			expect(cover).toContain('id="tint"');
		}
	});

	it('uses palette colours only and carries the journey roundel', () => {
		const cover = placeholderCover({
			id: 'x/y',
			name: 'A & B',
			lanes: ['rule', 'assistant', 'person'],
			stages: 5
		});
		const colours = new Set(cover.match(/#[0-9A-Fa-f]{6}/g));
		// Ink, teal, cream — and the roundel's white specular, the family's own.
		expect([...colours].sort()).toEqual(['#2B2620', '#3E8F8A', '#F3E9D2', '#FFFFFF']);
		expect(cover).toContain('aria-label="A &amp; B"');
		expect((cover.match(/<circle /g) ?? []).length).toBeGreaterThanOrEqual(5);
		expect(cover).toContain('<pattern');
	});

	it('prefers a delivered file on the seam', () => {
		expect(Object.keys(DELIVERED)).toEqual([]);
		const subject = { id: 'x/y', name: 'X', lanes: ['assistant'], stages: 2 };
		expect(coverFor(subject)).toBe(placeholderCover(subject));
	});
});
