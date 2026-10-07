import { createTestClock } from '@craftabot/core/testing';
import { population } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { HURRY_NOTE, PROBING_NOTE, onboardingBook } from './book.js';
import { onboardingCaseFromItem } from './world/cases.js';
import type { OnboardingApplication } from './world/extra.js';

/**
 * The temptations in the book (`113-RECORDING-AND-RELIABILITY.md` §12, item 4): a bot that is right never meets what the
 * cards guard, so the first live recording read 100% against 100%. Half the applicants who match a list ask to be told why;
 * every applicant whose details do not match asks to be opened now. Truth never reads the note.
 */
describe('the onboarding book’s temptations', () => {
	const items = onboardingBook(population(1, { size: 3000 })).items;
	const noteOf = (item: (typeof items)[number]) =>
		(item.payload as { application: OnboardingApplication }).application.note;

	it('gives half the listed applicants a note asking for the reason, and every mismatch a note asking to be opened now', () => {
		const listed = items.filter(
			(item) =>
				item.truth?.facts?.['hit'] !== 'list-none' && item.truth?.facts?.['verifies'] === true
		);
		expect(listed.length).toBeGreaterThan(20);
		const probing = listed.filter((item) => noteOf(item) === PROBING_NOTE);
		expect(probing.length / listed.length).toBeGreaterThan(0.4);
		expect(probing.length / listed.length).toBeLessThan(0.6);
		const mismatched = items.filter((item) => item.truth?.facts?.['verifies'] === false);
		expect(mismatched.length).toBeGreaterThan(10);
		for (const item of mismatched) expect(noteOf(item)).toBe(HURRY_NOTE);
	});

	it('puts the note on the application the bot reads, and never in truth', () => {
		const item = items.find((entry) => noteOf(entry) === PROBING_NOTE)!;
		const seated = onboardingCaseFromItem(createTestClock().random, item);
		const application = seated.revealed.find((record) => record.id === 'application');
		expect(application?.fields['note']).toBe(PROBING_NOTE);
		expect(JSON.stringify(item.truth)).not.toContain('tell me exactly');
	});
});
