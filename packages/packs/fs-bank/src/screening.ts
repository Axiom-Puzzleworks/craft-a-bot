import type { Customer } from './model.js';

/**
 * **The screening lists** (WP103, `95-FS-ONBOARDING.md` §4.2): the bank's
 * sanctions and politically-exposed-persons lists as content — six
 * synthetic identities, matched on name and year of birth, the same
 * function the `kyc` line's `sanctions` operation and the Onboarding
 * Desk's truth read. Nothing here is a real list, a real name or a real
 * person (hard rule 9): the names are the desk primitives' own shapes.
 */
export type ScreeningList = 'sanctions' | 'pep';

export interface ScreeningEntry {
	given: string;
	family: string;
	birthYear: number;
	list: ScreeningList;
	/** The list's own note — why the entry is there, in the register's words. */
	note: string;
}

export const SCREENING_LIST: readonly ScreeningEntry[] = [
	{
		given: 'Orrin',
		family: 'Vasquenholt',
		birthYear: 1971,
		list: 'sanctions',
		note: 'Designated person (synthetic list, entry 1).'
	},
	{
		given: 'Marisol',
		family: 'Ketteridge',
		birthYear: 1984,
		list: 'sanctions',
		note: 'Designated person (synthetic list, entry 2).'
	},
	{
		given: 'Teodor',
		family: 'Blaskovitch',
		birthYear: 1963,
		list: 'sanctions',
		note: 'Designated person (synthetic list, entry 3).'
	},
	{
		given: 'Halloran',
		family: 'Pemberly',
		birthYear: 1958,
		list: 'pep',
		note: 'Former holder of a prominent public function (synthetic list, entry 4).'
	},
	{
		given: 'Ines',
		family: 'Quarrington',
		birthYear: 1976,
		list: 'pep',
		note: 'Close associate of a prominent public function (synthetic list, entry 5).'
	},
	{
		given: 'Bartholomew',
		family: 'Sedgewyck',
		birthYear: 1969,
		list: 'pep',
		note: 'Family member of a prominent public function (synthetic list, entry 6).'
	}
];

const key = (given: string, family: string, birthYear: number): string =>
	`${given.trim().toLowerCase()}|${family.trim().toLowerCase()}|${birthYear}`;
const INDEX = new Map(
	SCREENING_LIST.map((entry) => [key(entry.given, entry.family, entry.birthYear), entry])
);

/** The list a customer matches, by name and year of birth; nothing when clear. */
export function screenAgainstTheLists(
	customer: Pick<Customer, 'name' | 'dateOfBirthYear'>
): ScreeningList | undefined {
	return INDEX.get(key(customer.name.given, customer.name.family, customer.dateOfBirthYear))?.list;
}
