import type { ConformanceIssue } from '../types.js';

/**
 * **`checkSynthetic`** (WP54 stage C, `45-TRUTH-SYNTHETIC.md` §4.6; `41-…`
 * §6.13, tenet 15, hard rule 9): sweeps text for the *shapes real
 * identifiers have* and refuses every hit. One issue per hit, naming the
 * file and line and a masked excerpt — the sweep never prints what it found.
 *
 * - `synthetic.pan` — 13–19 digits (single spaces or dashes allowed between
 *   groups) with a known issuer prefix whose Luhn check passes. The prefix
 *   is what keeps event ids, timestamps and token counts out of the net.
 * - `synthetic.iban` — a country code, two check digits and the country's
 *   BBAN length, whose mod-97 check passes.
 * - `synthetic.sort-code` — a value under a key naming a sort code, outside
 *   the reserved `99-` prefix. Only under such a key: a date looks like one.
 * - `synthetic.ni-number` — the National Insurance shape with a prefix HMRC
 *   could issue (not `QQ`, not the never-issued pairs).
 * - `synthetic.email` — an address on any domain but the reserved ones
 *   (`example.com/.org/.net`, `*.example`, `*.test`, `*.invalid`,
 *   `*.localhost`). An allow-list, since "resolves" needs a network.
 * - `synthetic.phone` — a UK mobile or London number outside Ofcom's drama
 *   ranges (`07700 900xxx`, `020 7946 0xxx`).
 */
export interface SyntheticSweepFile {
	path: string;
	text: string;
}

export function checkSynthetic(files: readonly SyntheticSweepFile[]): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];
	for (const file of files) {
		const lines = file.text.split(/\r?\n/);
		lines.forEach((line, index) => {
			const where = `${file.path}:${index + 1}`;
			for (const hit of pans(line))
				issues.push(issue('synthetic.pan', where, hit, 'a Luhn-valid card number'));
			for (const hit of ibans(line))
				issues.push(issue('synthetic.iban', where, hit, 'a valid IBAN'));
			for (const hit of sortCodes(line))
				issues.push(
					issue('synthetic.sort-code', where, hit, 'a sort code outside the reserved 99- range')
				);
			for (const hit of niNumbers(line))
				issues.push(
					issue('synthetic.ni-number', where, hit, 'an issuable National Insurance number')
				);
			for (const hit of emails(line))
				issues.push(
					issue('synthetic.email', where, hit, 'an email address on an unreserved domain')
				);
			for (const hit of phones(line))
				issues.push(
					issue('synthetic.phone', where, hit, 'a UK telephone number outside the drama ranges')
				);
		});
	}
	return issues;
}

function issue(check: string, where: string, hit: string, what: string): ConformanceIssue {
	return { check, message: `${where}: ${what} (${mask(hit)}) — nothing real, ever (hard rule 9)` };
}

/** The first four characters and the length; never the identifier itself. */
function mask(hit: string): string {
	return `${hit.slice(0, 4)}… ${hit.length} chars`;
}

// --- card numbers -------------------------------------------------------

/** Passes when a run of digits ends in its own Luhn check digit — what every real card does. */
export function luhnValid(digits: string): boolean {
	let sum = 0;
	let double = false;
	for (let index = digits.length - 1; index >= 0; index -= 1) {
		let value = Number(digits[index]);
		if (double) {
			value *= 2;
			if (value > 9) value -= 9;
		}
		sum += value;
		double = !double;
	}
	return sum % 10 === 0;
}

/** Visa, Mastercard (both ranges), American Express, Discover, JCB. */
function knownIssuer(digits: string): boolean {
	if (digits.startsWith('4')) return true;
	const two = Number(digits.slice(0, 2));
	if (two >= 51 && two <= 55) return true;
	const four = Number(digits.slice(0, 4));
	if (four >= 2221 && four <= 2720) return true;
	if (two === 34 || two === 37) return true;
	if (four === 6011 || two === 65) return true;
	if (two === 35) return true;
	return false;
}

const PAN = /(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g;

function pans(line: string): string[] {
	const hits: string[] = [];
	for (const match of line.matchAll(PAN)) {
		const digits = match[0].replace(/[ -]/g, '');
		if (digits.length < 13 || digits.length > 19) continue;
		if (!knownIssuer(digits)) continue;
		if (luhnValid(digits)) hits.push(match[0]);
	}
	return hits;
}

// --- IBANs --------------------------------------------------------------

const IBAN_LENGTHS: Record<string, number> = {
	GB: 22,
	DE: 22,
	FR: 27,
	NL: 18,
	ES: 24,
	IE: 22,
	IT: 27,
	BE: 16,
	PT: 25,
	CH: 21,
	AT: 20,
	PL: 28,
	SE: 24,
	DK: 18,
	NO: 15,
	FI: 18
};

const IBAN = /\b([A-Z]{2})(\d{2})((?: ?[A-Z0-9]){11,30})\b/g;

/** ISO 13616's mod-97 over the rearranged, letter-expanded string. */
export function ibanValid(compact: string): boolean {
	const country = compact.slice(0, 2);
	const expected = IBAN_LENGTHS[country];
	if (expected === undefined || compact.length !== expected) return false;
	const check = compact.slice(2, 4);
	if (check === '00' || check === '01' || check === '99') return false;
	const rearranged = compact.slice(4) + compact.slice(0, 4);
	let remainder = 0;
	for (const char of rearranged) {
		const value = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
		for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
	}
	return remainder === 1;
}

function ibans(line: string): string[] {
	const hits: string[] = [];
	for (const match of line.matchAll(IBAN)) {
		const compact = match[0].replaceAll(' ', '');
		if (ibanValid(compact)) hits.push(match[0]);
	}
	return hits;
}

// --- sort codes ---------------------------------------------------------

const SORT_CODE_KEYED = /"[^"]*sort[ _-]?code[^"]*"\s*:\s*"?(\d{2})-?(\d{2})-?(\d{2})\b/gi;

function sortCodes(line: string): string[] {
	const hits: string[] = [];
	for (const match of line.matchAll(SORT_CODE_KEYED)) {
		if (match[1] !== '99') hits.push(`${match[1]}-${match[2]}-${match[3]}`);
	}
	return hits;
}

// --- National Insurance numbers -----------------------------------------

const NI = /\b([A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]) ?(\d{2}) ?(\d{2}) ?(\d{2}) ?([A-D])\b/g;
const NEVER_ISSUED = new Set(['QQ', 'BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ']);

function niNumbers(line: string): string[] {
	const hits: string[] = [];
	for (const match of line.matchAll(NI)) {
		if (!NEVER_ISSUED.has(match[1] ?? '')) hits.push(match[0]);
	}
	return hits;
}

// --- email addresses ----------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
const RESERVED_DOMAINS = new Set(['example.com', 'example.org', 'example.net']);
const RESERVED_SUFFIXES = ['.example', '.test', '.invalid', '.localhost'];

export function reservedDomain(domain: string): boolean {
	const lower = domain.toLowerCase();
	if (RESERVED_DOMAINS.has(lower)) return true;
	return RESERVED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function emails(line: string): string[] {
	const hits: string[] = [];
	for (const match of line.matchAll(EMAIL)) {
		if (!reservedDomain(match[1] ?? '')) hits.push(match[0]);
	}
	return hits;
}

// --- telephone numbers --------------------------------------------------

const MOBILE = /\b07\d{3} ?\d{6}\b/g;
const LONDON = /\b020 ?\d{4} ?\d{4}\b/g;

function phones(line: string): string[] {
	const hits: string[] = [];
	for (const match of line.matchAll(MOBILE)) {
		if (!match[0].replaceAll(' ', '').startsWith('07700900')) hits.push(match[0]);
	}
	for (const match of line.matchAll(LONDON)) {
		if (!match[0].replaceAll(' ', '').startsWith('02079460')) hits.push(match[0]);
	}
	return hits;
}
