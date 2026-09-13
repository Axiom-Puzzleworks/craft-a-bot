import type { BankExtra } from '@craftabot/pack-fs-bank';
import type { Act, Category, SupportNeed } from './rules.js';

/**
 * **The desk's own state** (WP106, `92-FS-SERVICING.md` §3): the bank as
 * the lines read it plus where the request has got to. Serialised into the
 * snapshot; never truth — whether the caller is the customer reaches the
 * snapshot only when the desk has checked, and what they will disclose only
 * when they have.
 */
export interface ServiceRequest {
	/** The request in the caller's words. */
	subject: string;
	/** What the caller gave, as the identity check compares it. */
	given: { name: string; birthYear: number };
	/** For a third-party request: the authority the file carries, or none. */
	authority: 'power-of-attorney' | 'none';
	/** For an address change: the new postcode. */
	newPostcode?: string;
	/** For a third-party request: who is to have access. */
	grantee?: string;
}

export interface ServicingState {
	request: ServiceRequest;
	identified: boolean;
	verified: boolean;
	category?: Category;
	/** The act performed, once one is. */
	acted?: Act;
	/** A need — or none — recorded, in the caller's words. */
	recorded?: { need: SupportNeed; words: string };
	closed: boolean;
	/** The customer is in arrears on a loan — on the file, read by the handoff. */
	inArrears: boolean;
	/** The request came from the collections desk (its own handoff): it does not go back. */
	fromCollections: boolean;
}

export type ServicingExtra = BankExtra & { servicing: ServicingState };

/** The one queue item. */
export const REQUEST_ITEM = 'request';
export const CUSTOMER_RECORD = 'customer';
