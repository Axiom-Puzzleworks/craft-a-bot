import { describe, expect, it } from 'vitest';
import { checkSynthetic, ibanValid, luhnValid, reservedDomain } from './synthetic.js';

/**
 * `checkSynthetic` (WP54 stage C, `45-…` §4.6), one shape at a time. Every
 * "real-shaped" value here is built at run time from its own check digit or
 * assembled from parts, so no real-looking identifier sits in the source.
 */
const sweep = (text: string) =>
	checkSynthetic([{ path: 'f.json', text }]).map((issue) => issue.check);

function withLuhn(body: string): string {
	for (let digit = 0; digit < 10; digit += 1) {
		if (luhnValid(body + String(digit))) return body + String(digit);
	}
	throw new Error('unreachable');
}

describe('synthetic.pan', () => {
	it('refuses a Luhn-valid number with a known issuer prefix, spaced or not', () => {
		const visa = withLuhn('4' + '00000000000000');
		expect(sweep(`{"card":"${visa}"}`)).toEqual(['synthetic.pan']);
		expect(sweep(visa.replace(/(.{4})(?=.)/g, '$1 '))).toEqual(['synthetic.pan']);
		const amex = withLuhn('37' + '000000000000');
		expect(sweep(amex)).toEqual(['synthetic.pan']);
	});

	it('ignores a Luhn-failing number, an unknown prefix, and the runs a trace carries', () => {
		const visa = withLuhn('4' + '00000000000000');
		const wrong = visa.slice(0, -1) + String((Number(visa.at(-1)) + 1) % 10);
		expect(sweep(wrong)).toEqual([]);
		// A millisecond timestamp begins 17…, never an issuer prefix.
		expect(sweep('"at": 1757075139581')).toEqual([]);
		// Same digits, a prefix no issuer uses.
		expect(sweep(withLuhn('9' + '00000000000000'))).toEqual([]);
		// A run too long to be a card.
		expect(sweep('4' + '0'.repeat(25))).toEqual([]);
	});
});

describe('synthetic.iban', () => {
	it('refuses a valid IBAN and ignores impossible check digits', () => {
		// Build a valid GB IBAN: compute the check digits for a synthetic BBAN.
		const bban = 'CABX99912312345678';
		let check = '';
		for (let candidate = 2; candidate < 99; candidate += 1) {
			const digits = String(candidate).padStart(2, '0');
			if (ibanValid(`GB${digits}${bban}`)) {
				check = digits;
				break;
			}
		}
		expect(check).not.toBe('');
		expect(sweep(`GB${check}${bban}`)).toEqual(['synthetic.iban']);
		expect(sweep(`GB00${bban}`)).toEqual([]);
		expect(sweep(`GB00 CABX 9991 2312 3456 78`)).toEqual([]);
	});
});

describe('synthetic.sort-code', () => {
	it('refuses a sort code under a key naming it, outside 99-, and nothing else', () => {
		expect(sweep('{"sortCode": "12-34-56"}')).toEqual(['synthetic.sort-code']);
		expect(sweep('{"sort_code": "123456"}')).toEqual(['synthetic.sort-code']);
		expect(sweep('{"sortCode": "99-91-23"}')).toEqual([]);
		// A date, unkeyed: not a sort code.
		expect(sweep('{"date": "26-09-05"}')).toEqual([]);
	});
});

describe('synthetic.ni-number', () => {
	it('refuses an issuable prefix and passes QQ and the never-issued pairs', () => {
		expect(sweep('AB 12 34 56 C')).toEqual(['synthetic.ni-number']);
		expect(sweep('AB123456C')).toEqual(['synthetic.ni-number']);
		expect(sweep('QQ 12 34 56 C')).toEqual([]);
		expect(sweep('BG 12 34 56 C')).toEqual([]);
	});
});

describe('synthetic.email', () => {
	it('refuses an unreserved domain and passes the reserved ones', () => {
		expect(sweep('someone@craftabot.co.uk')).toEqual(['synthetic.email']);
		expect(sweep('ada.ashdown@example.org')).toEqual([]);
		expect(sweep('bot@desk.test')).toEqual([]);
		expect(sweep('bot@mail.invalid')).toEqual([]);
		expect(reservedDomain('Example.COM')).toBe(true);
	});
});

describe('synthetic.phone', () => {
	it('refuses a UK number outside the drama ranges', () => {
		expect(sweep('07123 456789')).toEqual(['synthetic.phone']);
		expect(sweep('020 1234 5678')).toEqual(['synthetic.phone']);
		expect(sweep('07700 900123')).toEqual([]);
		expect(sweep('020 7946 0123')).toEqual([]);
	});
});

describe('the report', () => {
	it('names the file and line and masks the value', () => {
		const visa = withLuhn('4' + '00000000000000');
		const [issue] = checkSynthetic([{ path: 'a/fixtures/b.json', text: `x\n{"c":"${visa}"}` }]);
		expect(issue?.message).toContain('a/fixtures/b.json:2');
		expect(issue?.message).not.toContain(visa);
		expect(issue?.message).toContain('16 chars');
	});
});
