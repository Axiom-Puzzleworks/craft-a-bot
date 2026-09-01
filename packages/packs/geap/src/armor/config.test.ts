import { describe, expect, it } from 'vitest';
import { armorConfigSchema } from './config.js';

const REQUIRED = { projectId: 'proj-1', location: 'europe-west2', templateId: 'cab-armour' };

describe('armorConfigSchema', () => {
	it('accepts the minimal shape and fills every default', () => {
		const config = armorConfigSchema.parse(REQUIRED);
		expect(config).toEqual({
			...REQUIRED,
			screenObservation: 'off',
			screenDecision: 'ask',
			screenResult: 'off',
			filters: {
				injection: 'inherit',
				harmfulContent: 'inherit',
				sensitiveData: 'inherit',
				maliciousLinks: 'inherit'
			},
			injectionMinConfidence: 'MEDIUM_AND_ABOVE',
			onFailure: 'stop-run',
			timeoutMs: 3000,
			maxTicks: 30,
			offline: false
		});
	});

	it('rejects a missing projectId/location/templateId', () => {
		expect(armorConfigSchema.safeParse({ location: 'europe-west2', templateId: 't' }).success).toBe(
			false
		);
		expect(armorConfigSchema.safeParse({ projectId: 'p', templateId: 't' }).success).toBe(false);
		expect(armorConfigSchema.safeParse({ projectId: 'p', location: 'europe-west2' }).success).toBe(
			false
		);
	});

	it('rejects an empty string for any of the three identity fields', () => {
		expect(armorConfigSchema.safeParse({ ...REQUIRED, projectId: '' }).success).toBe(false);
		expect(armorConfigSchema.safeParse({ ...REQUIRED, location: '' }).success).toBe(false);
		expect(armorConfigSchema.safeParse({ ...REQUIRED, templateId: '' }).success).toBe(false);
	});

	it('rejects an unrecognised screen dial value', () => {
		expect(armorConfigSchema.safeParse({ ...REQUIRED, screenObservation: 'ask' }).success).toBe(
			false
		);
	});

	it('accepts a per-filter override independent of the hook dials', () => {
		const config = armorConfigSchema.parse({
			...REQUIRED,
			filters: { injection: 'stop', harmfulContent: 'off' }
		});
		expect(config.filters).toEqual({
			injection: 'stop',
			harmfulContent: 'off',
			sensitiveData: 'inherit',
			maliciousLinks: 'inherit'
		});
	});

	it('rejects a repeatLimit outside [2, 10]', () => {
		expect(armorConfigSchema.safeParse({ ...REQUIRED, repeatLimit: 1 }).success).toBe(false);
		expect(armorConfigSchema.safeParse({ ...REQUIRED, repeatLimit: 11 }).success).toBe(false);
		expect(armorConfigSchema.safeParse({ ...REQUIRED, repeatLimit: 2 }).success).toBe(true);
	});

	it('rejects a timeoutMs outside [500, 10000]', () => {
		expect(armorConfigSchema.safeParse({ ...REQUIRED, timeoutMs: 499 }).success).toBe(false);
		expect(armorConfigSchema.safeParse({ ...REQUIRED, timeoutMs: 10001 }).success).toBe(false);
	});

	it('accepts offline: true with no other dials set', () => {
		expect(armorConfigSchema.safeParse({ ...REQUIRED, offline: true }).success).toBe(true);
	});
});
