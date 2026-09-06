import { describe, expect, it } from 'vitest';
import type { EvidenceStore } from '@craftabot/core';
import { checkEvidenceStore } from './checks/evidence-store.js';
import type { EvidenceStoreConformanceFixture } from './types.js';

/** The evidence-store suite as a `describe` (WP70, `58-…` §4.2), the sink's shape. */
export function describeEvidenceStoreConformance(
	store: EvidenceStore,
	fixture: EvidenceStoreConformanceFixture
): void {
	describe(`${store.id} — evidence store conformance`, () => {
		it(
			fixture.expectsNetwork === false
				? 'round-trips every item, verifies its receipts and refuses a wrong digest'
				: 'rejects a push, a pull and a verify with no network, and keeps the credential out of the message',
			async () => {
				const issues = await checkEvidenceStore(store, fixture);
				expect(issues).toEqual([]);
			}
		);
	});
}
