import type { DeskRecord, ToolResult } from '@craftabot/core';
import { bankExtraOf, type BankExtra, type BankPurpose } from '../extra.js';
import { bankRecords } from '../records.js';

/**
 * What every line shares (WP59 stage B, `48-FS-BANK.md` §4.5): the bank
 * read from the world's snapshot, the one purpose table that decides
 * whether a `special-category` record may be answered, and the plain
 * failures a line gives when the desk carries no bank.
 */
export const lineStrings = {
	noBank: 'This desk has no bank behind it — nothing to answer from.',
	notForPurpose: (purpose: string) =>
		`That record is not available for this purpose (${purpose}); it is special-category data.`,
	noSuchRecord: (id: string) => `No record "${id}" on file.`,
	noSuchAccount: (id: string) => `No account "${id}" on file.`,
	noSuchOp: (line: string, op: string) => `${line} has no operation "${op}".`
} as const;

/**
 * Which purposes may read a `special-category` record through a line
 * (§4.5): the desks that act on a disclosed vulnerability, and no other.
 */
export const PURPOSE_ALLOWS_SPECIAL_CATEGORY: ReadonlySet<BankPurpose> = new Set<BankPurpose>([
	'advice',
	'complaints'
]);

export function mayRead(purpose: BankPurpose, record: DeskRecord): boolean {
	if (record.classification !== 'special-category') return true;
	return PURPOSE_ALLOWS_SPECIAL_CATEGORY.has(purpose);
}

export function withBank(
	worldState: unknown,
	answer: (extra: BankExtra) => ToolResult
): ToolResult {
	const extra = bankExtraOf(worldState);
	if (!extra) return { ok: false, output: lineStrings.noBank };
	return answer(extra);
}

/** Every record the bank would show for the case — revealed and hidden — by id. */
export function recordsOf(extra: BankExtra): DeskRecord[] {
	const { revealed, hidden } = bankRecords(extra.bank);
	return [...revealed, ...hidden];
}

export function describeRecord(record: DeskRecord): string {
	const fields = Object.entries(record.fields)
		.map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value === null ? '—' : String(value)}`)
		.join('; ');
	return `${record.title} — ${fields}`;
}

export const money = (amount: number): string => `£${Math.abs(amount).toLocaleString('en-GB')}`;
