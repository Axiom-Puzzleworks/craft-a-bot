import { checkSynthetic } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { seededRandom } from './seeded.js';
import {
	luhnCheckDigit,
	SYNTHETIC_SECRET_MARKER,
	syntheticAccountNumber,
	syntheticAddress,
	syntheticEmail,
	syntheticIban,
	syntheticName,
	syntheticNiNumber,
	syntheticPan,
	syntheticPhone,
	syntheticSecret,
	syntheticSortCode
} from './synthetic.js';

/**
 * The synthetic primitives (WP54 stage C, `45-…` §4.5): seed-stable, and
 * never a shape the sweep refuses — the two lines of principle 5 checked
 * against each other over a thousand draws.
 */
const DRAWS = 1000;

function thousand<T>(make: (random: () => number) => T): T[] {
	const random = seededRandom(0x5eed);
	return Array.from({ length: DRAWS }, () => make(random));
}

describe('the synthetic primitives', () => {
	it('are seed-stable', () => {
		const a = seededRandom(3);
		const b = seededRandom(3);
		expect(syntheticName(a)).toEqual(syntheticName(b));
		expect(syntheticPan(a)).toEqual(syntheticPan(b));
		expect(syntheticAddress(a)).toEqual(syntheticAddress(b));
	});

	it('card numbers always fail Luhn by construction and look like cards otherwise', () => {
		for (const pan of thousand(syntheticPan)) {
			const digits = pan.replaceAll(' ', '');
			expect(digits).toMatch(/^(4\d{15}|5[1-5]\d{14})$/);
			expect(Number(digits.at(-1))).not.toBe(luhnCheckDigit(digits.slice(0, -1)));
		}
	});

	it('sort codes, NI numbers, IBANs, emails, phones and postcodes take their reserved shapes', () => {
		for (const code of thousand(syntheticSortCode)) expect(code).toMatch(/^99-9\d-\d\d$/);
		for (const ni of thousand(syntheticNiNumber)) expect(ni).toMatch(/^QQ \d\d \d\d \d\d [A-D]$/);
		for (const iban of thousand(syntheticIban))
			expect(iban.replaceAll(' ', '')).toMatch(/^GB00CABX999\d{11}$/);
		for (const email of thousand(syntheticEmail)) expect(email).toMatch(/@example\.(com|org|net)$/);
		for (const phone of thousand(syntheticPhone))
			expect(phone).toMatch(/^(07700 900\d{3}|020 7946 0\d{3})$/);
		for (const address of thousand(syntheticAddress)) {
			expect(address.postcode).toMatch(/^ZZ\d\d \d[A-Z]{2}$/);
			expect(address.line1).toMatch(/^\d+ /);
		}
		for (const account of thousand(syntheticAccountNumber)) expect(account).toMatch(/^\d{8}$/);
	});

	it('a synthetic secret takes each credential shape, carries the marker, and passes the sweep (WP151)', () => {
		const shapes = {
			'api-key': /^sk-[A-Za-z0-9_-]{20,}$/,
			'aws-access-key': /^AKIA[0-9A-Z]{16}$/,
			'github-token': /^ghp_[A-Za-z0-9]{36,}$/
		} as const;
		for (const kind of Object.keys(shapes) as Array<keyof typeof shapes>) {
			const random = seededRandom(7);
			const secrets = Array.from({ length: 200 }, () => syntheticSecret(random, kind));
			for (const secret of secrets) {
				expect(secret, kind).toMatch(shapes[kind]);
				expect(secret).toContain(SYNTHETIC_SECRET_MARKER);
			}
			expect(syntheticSecret(seededRandom(7), kind)).toBe(secrets[0]);
			expect(checkSynthetic([{ path: 'secrets', text: secrets.join('\n') }])).toEqual([]);
		}
	});

	it('a thousand whole people pass the sweep', () => {
		const random = seededRandom(42);
		const people = Array.from({ length: DRAWS }, () => {
			const name = syntheticName(random);
			return {
				name,
				email: syntheticEmail(random, name),
				phone: syntheticPhone(random),
				address: syntheticAddress(random),
				sortCode: syntheticSortCode(random),
				accountNumber: syntheticAccountNumber(random),
				iban: syntheticIban(random),
				card: syntheticPan(random),
				ni: syntheticNiNumber(random)
			};
		});
		const issues = checkSynthetic([
			{ path: 'people.json', text: JSON.stringify(people, null, 2) },
			{ path: 'people.jsonl', text: people.map((person) => JSON.stringify(person)).join('\n') }
		]);
		expect(issues).toEqual([]);
	});
});
