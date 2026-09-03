import { describe, expect, it } from 'vitest';
import { armorBrickKind } from '@craftabot/pack-geap';
import { describeFields } from './schema-fields.js';

/**
 * **`ArmourPanel.svelte` is not needed, verified** (WP52, `40-DEBTS.md`
 * §4.4; `25-…` §8's follow-up, made unnecessary by WP39's `'object'` case).
 * The Armour Brick's nested `filters` describes as an object control with
 * one enum control per filter beneath it, and every flat field beside it
 * still describes as before — so the schema-driven panel covers the whole
 * kind and no hand-written panel is owed.
 */
describe('the Armour Brick through the schema panel', () => {
	it('describes filters as a nested object of enum controls', () => {
		const fields = describeFields(armorBrickKind.configSchema, armorBrickKind.controlHints);
		const filters = fields.find((field) => field.name === 'filters');
		expect(filters?.control.kind).toBe('object');
		if (filters?.control.kind !== 'object') return;
		expect(filters.control.fields.length).toBeGreaterThan(0);
		for (const filter of filters.control.fields) {
			expect(['enum', 'select', 'choice']).toContain(filter.control.kind);
		}
		// The flat fields describe as controls too — nothing falls to a plain text box by accident.
		for (const name of ['projectId', 'location', 'templateId', 'offline']) {
			expect(fields.some((field) => field.name === name)).toBe(true);
		}
	});
});
