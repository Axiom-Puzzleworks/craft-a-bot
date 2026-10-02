import { describe, expect, it } from 'vitest';
import { parseEngineEvent } from '@craftabot/core';
import { observe } from './event-harvest.js';
import { sensorFixtures } from './sensor-fixtures.js';

/**
 * **The sensor fixtures** (WP159, `112-REAL-ENOUGH-PLAN.md` §5): each one
 * produces events that parse, and shows everything it says it covers.
 */
describe('sensor fixtures', () => {
	it('produce valid events and cover what they claim', async () => {
		const started = Date.now();
		const fixtures = await sensorFixtures();
		expect(Date.now() - started).toBeLessThan(15_000);
		expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);
		for (const fixture of fixtures) {
			for (const event of fixture.events) parseEngineEvent(event);
			const seen = observe(fixture.events);
			const missing = fixture.covers.filter(
				(name) => !seen.types.has(name) && !seen.fields.has(name)
			);
			expect(missing, `${fixture.id} does not show ${missing.join(', ')}`).toEqual([]);
		}
	}, 30_000);
});
