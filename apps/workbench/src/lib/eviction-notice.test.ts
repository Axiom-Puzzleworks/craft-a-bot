import { describe, expect, it } from 'vitest';
import { evictionNotice } from './eviction-notice.js';

/**
 * **The eviction notice spec** (`16-…` §1.5 acceptance, `12-…` D15).
 *
 * The storage layer has always reported what it dropped; the defect was that
 * nothing said it out loud, so a capped scrapbook lost adventures silently.
 */
describe('evictionNotice', () => {
	it('says nothing when nothing was tidied away', () => {
		expect(evictionNotice(0)).toBeUndefined();
	});

	/** Defensive: a negative count is nonsense, and nonsense should stay quiet. */
	it('says nothing for a nonsense count', () => {
		expect(evictionNotice(-1)).toBeUndefined();
	});

	it('speaks in the singular about a single lost adventure', () => {
		expect(evictionNotice(1)).toBe(
			'The scrapbook was full, so the oldest adventure was tidied away to make room. Pin an adventure to keep it for good.'
		);
	});

	it('counts them when there was more than one', () => {
		expect(evictionNotice(3)).toBe(
			'The scrapbook was full, so the 3 oldest adventures were tidied away to make room. Pin an adventure to keep it for good.'
		);
	});

	/**
	 * The notice has to do two jobs at once: explain what happened, and tell the
	 * child what to do about it next time. Pinning is the answer, and a notice
	 * that only apologised would leave them no way to stop it happening again.
	 */
	it('always points at the way to prevent it', () => {
		for (const count of [1, 2, 50]) {
			expect(evictionNotice(count)).toContain('Pin an adventure to keep it');
		}
	});
});
