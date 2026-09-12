import { createPackRegistry } from '@craftabot/core';
import { checkCalibration, checkDomainPack } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import vaccinationPack from '../../vaccination/src/index.js';
import referralPack from '../../referral/src/index.js';
import vetPracticePack, { CALIBRATION, PERSONA_IDS, veterinaryPracticeDomain } from './index.js';

/**
 * The scaffold's own proof (`93-DOMAIN-PACK.md` §4): the shape passes the
 * checklist, and the numbers do not pass review until a reader has read
 * them.
 */
const packs = [vetPracticePack, vaccinationPack, referralPack];

describe('vet-practice/veterinary-practice', () => {
	it('passes checkDomainPack with placeholder content', () => {
		const registry = createPackRegistry();
		for (const pack of packs) registry.registerPack(pack);
		const issues = checkDomainPack(veterinaryPracticeDomain, registry, {
			manifests: packs,
			personas: PERSONA_IDS
		});
		expect(issues.map((issue) => `${issue.check}: ${issue.message}`)).toEqual([]);
	});

	it('fails calibration review: every row is a stated assumption awaiting a reader', () => {
		expect(checkCalibration(CALIBRATION)).toEqual([]);
		const review = checkCalibration(CALIBRATION, { requireReview: true });
		expect(review.length).toBe(CALIBRATION.rows.length);
		expect(new Set(review.map((issue) => issue.check))).toEqual(
			new Set(['calibration.review-pending'])
		);
	});
});
