/**
 * **The synthetic primitives** (WP54 stage C, `45-TRUTH-SYNTHETIC.md` §4.5;
 * `41-…` §6.13, tenet 15). Everything a desk or a bank generates a person
 * from, and none of it can be real *by construction*: a card number whose
 * Luhn check fails by one, a sort code in a range no clearing bank holds,
 * the NI prefix HMRC never issues, IBAN check digits ISO 13616 cannot
 * produce, the reserved `example.` domains, Ofcom's drama telephone ranges,
 * streets and towns that do not exist. `checkSynthetic` in the testkit is
 * the other line: it refuses the shapes real identifiers have, and a test
 * here proves a thousand draws of each primitive never trip it.
 *
 * Every function takes the caller's `random` and nothing else (hard rule 5):
 * the same seed, the same person.
 */

const GIVEN_NAMES = [
	'Ada',
	'Amara',
	'Arjun',
	'Bea',
	'Bram',
	'Cara',
	'Cyrus',
	'Dev',
	'Dilan',
	'Eira',
	'Elio',
	'Fenna',
	'Finn',
	'Greta',
	'Hal',
	'Idris',
	'Ines',
	'Jory',
	'Juno',
	'Kai',
	'Kira',
	'Lars',
	'Leda',
	'Mika',
	'Milo',
	'Nell',
	'Noor',
	'Orla',
	'Otto',
	'Pia',
	'Quinn',
	'Rafe',
	'Roza',
	'Sol',
	'Suki',
	'Tam',
	'Teo',
	'Uma',
	'Vera',
	'Wren',
	'Yusuf',
	'Zara'
] as const;

const FAMILY_NAMES = [
	'Ashdown',
	'Bellweather',
	'Brightwater',
	'Calloway',
	'Colebrook',
	'Dunmore',
	'Eastwood',
	'Fairweather',
	'Fenwick',
	'Greyling',
	'Hartwell',
	'Holloway',
	'Inglewood',
	'Kestrel',
	'Larkspur',
	'Lockwood',
	'Marchbank',
	'Moorcroft',
	'Nightingale',
	'Oakhurst',
	'Penhallow',
	'Quarrie',
	'Ravenscroft',
	'Rookwood',
	'Saltmarsh',
	'Stonebridge',
	'Thornbury',
	'Underhill',
	'Vance',
	'Wainwright',
	'Wetherby',
	'Yardley'
] as const;

const STREETS = [
	'Alder Row',
	'Brasswick Lane',
	'Candlemaker Street',
	'Dovetail Close',
	'Ember Walk',
	'Fable Crescent',
	'Gaslight Terrace',
	'Hollowmere Road',
	'Ironmonger Yard',
	'Juniper Rise',
	'Kettlewell Drive',
	'Lantern Court',
	'Millwheel Avenue',
	'Nettlebed Way',
	'Orrery Square',
	'Pennyfarthing Street',
	'Quillstone Road',
	'Ropewalk Gardens',
	'Spindle Hill',
	'Tinderbox Lane',
	'Umber Place',
	'Vellum Street',
	'Windlass Road'
] as const;

const TOWNS = [
	'Ashcombe Vale',
	'Brindleford',
	'Cinderhaven',
	'Dunwater',
	'Elmsgate',
	'Fernbrook',
	'Greywold',
	'Hollins Cross',
	'Kelder Bay',
	'Marlowe Green',
	'Netherby Fold',
	'Oxmoor',
	'Peverell',
	'Quenby',
	'Saltcote',
	'Thistlewick',
	'Wyvern Hollow'
] as const;

const pick = <T>(random: () => number, from: readonly T[]): T =>
	from[Math.floor(random() * from.length)] as T;
const digit = (random: () => number): number => Math.floor(random() * 10);
const digits = (random: () => number, count: number): string =>
	Array.from({ length: count }, () => digit(random)).join('');

export interface SyntheticName {
	given: string;
	family: string;
	full: string;
}

/** A name from two small corpora — plain, mixed, and too few to be anybody in particular. */
export function syntheticName(random: () => number): SyntheticName {
	const given = pick(random, GIVEN_NAMES);
	const family = pick(random, FAMILY_NAMES);
	return { given, family, full: `${given} ${family}` };
}

/**
 * The Luhn check digit for a run of digits — what a real card, and nothing
 * here, ends with.
 */
export function luhnCheckDigit(body: string): number {
	let sum = 0;
	let double = true;
	for (let index = body.length - 1; index >= 0; index -= 1) {
		let value = Number(body[index]);
		if (double) {
			value *= 2;
			if (value > 9) value -= 9;
		}
		sum += value;
		double = !double;
	}
	return (10 - (sum % 10)) % 10;
}

/**
 * A 16-digit card number with a Visa or Mastercard shape whose last digit is
 * the Luhn check digit **plus one** — every real card passes Luhn, this one
 * cannot. Spaced in fours.
 */
export function syntheticPan(random: () => number): string {
	const prefix = random() < 0.5 ? '4' : '5' + String(1 + Math.floor(random() * 5));
	const body = prefix + digits(random, 15 - prefix.length);
	const wrong = (luhnCheckDigit(body) + 1) % 10;
	const raw = body + String(wrong);
	return raw.replace(/(.{4})(?=.)/g, '$1 ');
}

/** Eight digits; meaningless without a sort code, and the sort code is the guard. */
export function syntheticAccountNumber(random: () => number): string {
	return digits(random, 8);
}

/** `99-9x-xx` — a range no clearing bank holds; the sweep treats `99-` as reserved. */
export function syntheticSortCode(random: () => number): string {
	return `99-9${digit(random)}-${digits(random, 2)}`;
}

/** `QQ 12 34 56 A` — the prefix HMRC never issues and uses in its own examples. */
export function syntheticNiNumber(random: () => number): string {
	const suffix = pick(random, ['A', 'B', 'C', 'D'] as const);
	return `QQ ${digits(random, 2)} ${digits(random, 2)} ${digits(random, 2)} ${suffix}`;
}

/**
 * `GB00 CABX 9999 …` — check digits `00` are impossible under ISO 13616
 * (mod-97 never yields 00, 01 or 99) and `CABX` is no bank's code; the sort
 * code inside it is a synthetic one.
 */
export function syntheticIban(random: () => number): string {
	const sortCode = syntheticSortCode(random).replaceAll('-', '');
	const account = syntheticAccountNumber(random);
	const raw = `GB00CABX${sortCode}${account}`;
	return raw.replace(/(.{4})(?=.)/g, '$1 ');
}

/** `<given>.<family>@example.com` (or `.org`, `.net`) — RFC 2606 reserves the `example.` domains. */
export function syntheticEmail(random: () => number, name?: SyntheticName): string {
	const person = name ?? syntheticName(random);
	const domain = pick(random, ['example.com', 'example.org', 'example.net'] as const);
	return `${person.given.toLowerCase()}.${person.family.toLowerCase()}@${domain}`;
}

/** A UK mobile in `07700 900xxx` or a London number in `020 7946 0xxx` — Ofcom's drama ranges. */
export function syntheticPhone(random: () => number): string {
	return random() < 0.5 ? `07700 900${digits(random, 3)}` : `020 7946 0${digits(random, 3)}`;
}

export interface SyntheticAddress {
	line1: string;
	town: string;
	postcode: string;
}

/** A house on a fictional street in a fictional town, with a `ZZ99 9ZZ`-shaped postcode (`ZZ` is no postcode area). */
export function syntheticAddress(random: () => number): SyntheticAddress {
	const house = 1 + Math.floor(random() * 120);
	const letters = 'ABDEFGHJLNPQRSTUWXYZ';
	const tail = `${digit(random)}${pick(random, [...letters])}${pick(random, [...letters])}`;
	return {
		line1: `${house} ${pick(random, STREETS)}`,
		town: pick(random, TOWNS),
		postcode: `ZZ${1 + Math.floor(random() * 9)}${digit(random)} ${tail}`
	};
}
