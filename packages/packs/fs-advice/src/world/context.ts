/**
 * Whether a desk record is one the advice journey has a use for (`113-RECORDING-AND-RELIABILITY.md` §12, item 12): the
 * customer's own, the accounts and what moves through them, which a recommendation weighs for affordability. The relational
 * rung hands an advice bot these (`fs-bank`'s `RELATIONAL_KINDS_BY_PURPOSE`) and not the complaints or the credit file.
 */
export function adviceNeeds(recordId: string): boolean {
	return (
		recordId === 'customer' ||
		recordId.startsWith('account-') ||
		recordId.startsWith('transactions-')
	);
}
