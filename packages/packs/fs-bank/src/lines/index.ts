import type { ServiceLine } from '@craftabot/core';
import { coreBankingLine, paymentsLine } from './banking.js';
import { crmLine } from './crm.js';
import {
	complaintsLine,
	creditBureauLine,
	kycLine,
	orderDeskLine,
	productCatalogueLine,
	sarFilingLine
} from './services.js';

/**
 * The nine lines (WP59 stage B, `48-FS-BANK.md` §4.5). Each `simulate`s
 * over the bank in the world's snapshot (`BankExtra`), draws only from
 * `ctx.random`, filters `special-category` records by the desk's purpose,
 * and returns any mutation as `data.ledger` for the desk's own action to
 * write — a line reads the world; it does not act in it.
 */
export const bankServiceLines: ServiceLine[] = [
	crmLine,
	coreBankingLine,
	paymentsLine,
	kycLine,
	productCatalogueLine,
	orderDeskLine,
	creditBureauLine,
	sarFilingLine,
	complaintsLine
];

export {
	complaintsLine,
	coreBankingLine,
	creditBureauLine,
	crmLine,
	kycLine,
	orderDeskLine,
	paymentsLine,
	productCatalogueLine,
	sarFilingLine
};
export { PURPOSE_ALLOWS_SPECIAL_CATEGORY, mayRead, lineStrings } from './shared.js';
