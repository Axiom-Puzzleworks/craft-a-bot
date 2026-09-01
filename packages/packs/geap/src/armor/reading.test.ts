import { describe, expect, it } from 'vitest';
import { fixtures } from '../fixtures/index.js';
import { readSanitizationResult } from './reading.js';

describe('readSanitizationResult', () => {
	it('reads a clean envelope: outcome ok, nothing matched, every filter ran', () => {
		const reading = readSanitizationResult(fixtures.clean);
		expect(reading.outcome).toBe('ok');
		expect(reading.matched).toBe(false);
		for (const filter of Object.values(reading.filters)) {
			expect(filter.ran).toBe(true);
			expect(filter.matched).toBe(false);
		}
		expect(reading.redactedText).toBeUndefined();
	});

	it('reads a high-confidence injection match', () => {
		const reading = readSanitizationResult(fixtures['injection-high']);
		expect(reading.matched).toBe(true);
		expect(reading.filters.injection).toEqual({ ran: true, matched: true, confidence: 'HIGH' });
		expect(reading.filters.hate.matched).toBe(false);
	});

	it('reads a medium-confidence injection match', () => {
		const reading = readSanitizationResult(fixtures['injection-medium']);
		expect(reading.filters.injection).toEqual({
			ran: true,
			matched: true,
			confidence: 'MEDIUM_AND_ABOVE'
		});
	});

	it('reads a rai/dangerous match without flagging the other rai sub-filters', () => {
		const reading = readSanitizationResult(fixtures['rai-dangerous']);
		expect(reading.filters.dangerous).toEqual({ ran: true, matched: true });
		expect(reading.filters.hate).toEqual({ ran: true, matched: false });
		expect(reading.filters.harassment).toEqual({ ran: true, matched: false });
		expect(reading.filters.sexual).toEqual({ ran: true, matched: false });
	});

	it('reads a basic sdp match with no redacted text', () => {
		const reading = readSanitizationResult(fixtures['sdp-basic']);
		expect(reading.filters.sensitiveData).toEqual({ ran: true, matched: true });
		expect(reading.redactedText).toBeUndefined();
	});

	it('reads an advanced sdp match and carries the de-identified text', () => {
		const reading = readSanitizationResult(fixtures['sdp-deidentified']);
		expect(reading.filters.sensitiveData).toEqual({ ran: true, matched: true });
		expect(reading.redactedText).toContain('[PERSON_NAME]');
	});

	it('reads a malicious-uri match', () => {
		const reading = readSanitizationResult(fixtures['malicious-uri']);
		expect(reading.filters.maliciousUri).toEqual({ ran: true, matched: true });
	});

	it('reads a csam match', () => {
		const reading = readSanitizationResult(fixtures.csam);
		expect(reading.filters.csam).toEqual({ ran: true, matched: true });
	});

	it('reads a partial result: the skipped filter is unrun, not clean', () => {
		const reading = readSanitizationResult(fixtures['partial-skipped']);
		expect(reading.outcome).toBe('partial');
		expect(reading.filters.injection).toEqual({ ran: false, matched: false });
		expect(reading.filters.hate.ran).toBe(true);
	});

	it('reads a transport failure with no filterResults at all', () => {
		const reading = readSanitizationResult(fixtures.failure);
		expect(reading.outcome).toBe('failure');
		for (const filter of Object.values(reading.filters)) {
			expect(filter).toEqual({ ran: false, matched: false });
		}
	});

	it('throws on an envelope that does not match the schema', () => {
		expect(() => readSanitizationResult({ nonsense: true })).toThrow();
	});
});
