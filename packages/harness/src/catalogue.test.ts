import { describe, expect, it } from 'vitest';
import { OBLIGATION_TAGS } from '@craftabot/pack-fs-bank';
import { GUARDRAIL_CATALOGUE, checkCatalogue } from '@craftabot/governance';
import { coverageReport } from '@craftabot/governance/reports';
import { createRegistry, defaultConfig } from './config.js';

/**
 * The catalogue against the whole registry (WP98, `86-CATALOGUE.md` §6):
 * every `shipped` and `connectable` entry's components resolve to what the
 * default host installs, every obligation tag is the bank's, and the fold's
 * rows equal the entries. `checkCatalogue` is what makes a status verified
 * rather than typed.
 */
const registry = createRegistry(defaultConfig());

describe('the Guardrail Catalogue against every pack', () => {
	it('checkCatalogue is clean', () => {
		expect(checkCatalogue(GUARDRAIL_CATALOGUE, registry)).toEqual([]);
	});

	it('every shipped entry names something registered, and every obligation is the bank’s', () => {
		const rows = coverageReport(GUARDRAIL_CATALOGUE, registry);
		expect(rows).toHaveLength(GUARDRAIL_CATALOGUE.entries.length);
		for (const row of rows) {
			if (row.status === 'shipped') {
				expect(
					row.components.length + (row.entry.coverage.implementedBy?.length ?? 0),
					row.entry.id
				).toBeGreaterThan(0);
			}
			for (const tag of row.entry.obligations ?? []) {
				expect(Object.keys(OBLIGATION_TAGS), `${row.entry.id} ${tag}`).toContain(tag);
			}
		}
		// The desks' stacks fit the shipped components, so the fold finds them.
		const budget = rows.find((row) => row.entry.id === 'budget-cap');
		expect(budget?.stacks.length).toBeGreaterThan(0);
	});
});
