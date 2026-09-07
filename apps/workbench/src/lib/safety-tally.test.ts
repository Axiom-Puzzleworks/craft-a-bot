import { describe, expect, it } from 'vitest';
import { failedClosedWords, safetyWords } from './safety-tally.js';

/**
 * The ticker's words (`16-…` §2.1). The count itself, `safetyTally`, is tested
 * where it now lives — `@craftabot/governance/reports` (WP36 stage B).
 */
describe('safetyWords', () => {
	/**
	 * Silence before the first check. "0 checks, 0 saves" reads like the brick is
	 * broken rather than simply not needed yet.
	 */
	it('says nothing at all before the first check', () => {
		expect(safetyWords({ checks: 0, saves: 0, failedClosed: 0 })).toBeUndefined();
	});

	/** An outage that failed closed is never a save (UX-1). */
	it('never counts a fail-closed stop as a save', () => {
		const tally = { checks: 2, saves: 0, failedClosed: 1 };
		expect(safetyWords(tally)).toBe('2 checks, nothing to stop');
		expect(failedClosedWords(tally)).toBe('1 check could not run');
		expect(failedClosedWords({ checks: 2, saves: 1, failedClosed: 0 })).toBeUndefined();
	});

	/** The quiet success — the case §2.1 exists to make visible. */
	it('says so when it checked and had nothing to stop', () => {
		expect(safetyWords({ checks: 14, saves: 0, failedClosed: 0 })).toBe(
			'14 checks, nothing to stop'
		);
	});

	it('counts the saves when there were any', () => {
		expect(safetyWords({ checks: 14, saves: 2, failedClosed: 0 })).toBe('14 checks, 2 saves');
	});

	/** Read aloud by a five-year-old, so the singulars are spelled out. */
	it('does not say "1 checks" or "1 saves"', () => {
		expect(safetyWords({ checks: 1, saves: 0, failedClosed: 0 })).toBe('1 check, nothing to stop');
		expect(safetyWords({ checks: 3, saves: 1, failedClosed: 0 })).toBe('3 checks, 1 save');
	});
});
