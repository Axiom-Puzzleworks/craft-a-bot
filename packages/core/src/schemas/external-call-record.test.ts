import { describe, expect, it } from 'vitest';
import { externalCallRecordSchema, externalOutcomeKindSchema } from './shared.js';

/**
 * WP39 stage A (`29-GUARD-SHELL.md` §4.1): the record is widened, not
 * replaced. The Armour Brick's rows — the only ones any stored trace holds
 * today — must parse exactly as before, and a second vendor's row, with the
 * keys the Armour Brick never writes, must parse too.
 */

const ARMOUR_ROW = {
	service: 'model-armor',
	endpoint:
		'https://modelarmor.europe-west2.rep.googleapis.com/v1/projects/p/locations/europe-west2/templates/cab-armour:sanitizeModelResponse',
	template: 'cab-armour',
	latencyMs: 0,
	charsScreened: 42,
	outcome: 'offline',
	filters: {
		injection: { ran: true, matched: false },
		csam: { ran: true, matched: false, confidence: 'MEDIUM_AND_ABOVE' }
	}
};

describe('externalCallRecordSchema, widened', () => {
	it('parses an Armour Brick row unchanged', () => {
		expect(externalCallRecordSchema.parse(ARMOUR_ROW)).toEqual(ARMOUR_ROW);
	});

	it('parses a second vendor: no template, a policyRef and a method instead', () => {
		const row = {
			service: 'bedrock-guardrails',
			method: 'ApplyGuardrail',
			endpoint: 'https://bedrock-runtime.eu-west-2.amazonaws.com/guardrail/g-1/version/3/apply',
			policyRef: 'g-1@3',
			latencyMs: 120,
			charsScreened: 9,
			outcome: 'ok'
		};
		expect(externalCallRecordSchema.parse(row)).toEqual(row);
	});

	it('still refuses an empty service, an unknown outcome and a negative latency', () => {
		expect(externalCallRecordSchema.safeParse({ ...ARMOUR_ROW, service: '' }).success).toBe(false);
		expect(externalCallRecordSchema.safeParse({ ...ARMOUR_ROW, outcome: 'meh' }).success).toBe(
			false
		);
		expect(externalCallRecordSchema.safeParse({ ...ARMOUR_ROW, latencyMs: -1 }).success).toBe(
			false
		);
	});

	it('names the six transport kinds, and they are exactly the outcomes that are not readings', () => {
		const readings = ['ok', 'partial', 'failure', 'offline'];
		const all = externalCallRecordSchema.shape.outcome.options;
		expect(all.filter((o) => !readings.includes(o))).toEqual(externalOutcomeKindSchema.options);
		expect(externalOutcomeKindSchema.options).toEqual([
			'bad-token',
			'no-permission',
			'no-template',
			'quota',
			'timeout',
			'unavailable'
		]);
	});
});
