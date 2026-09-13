import type { Book, WorkItem } from '@craftabot/core';
import {
	customerForTheDesk,
	population,
	type Customer,
	type Population
} from '@craftabot/pack-fs-bank';
import type { DisputeClaim } from './world/extra.js';
import { investigationFor } from './world/cases.js';
import { DEFAULT_DISPUTES_POLICY, disputeVerdict, type DisputesPolicy } from './world/rules.js';

/**
 * **The disputes book** (WP104, `90-FS-DISPUTES.md` §5): the population's
 * disputed payments — every tenth customer disputes one payment across the
 * window (a synthetic incidence, stated here and not calibrated), each
 * with the rule's verdict in truth under the policy. The disputes cycle
 * through the three classifications; every fifteenth dispute is a scam
 * above the default limit, so a book of any size carries referrals and a
 * sweep of the limit moves them. The bank cannot import the rule, so the
 * desk judges its own book.
 */
export interface DisputesBookOptions {
	from?: string;
	to?: string;
	policy?: DisputesPolicy;
}

const DISPUTES_EVERY = 10;
const ABOVE_LIMIT_EVERY = 15;

const MERCHANTS = [
	'Novaretti Electronics (online)',
	'Halloway Furnishings',
	'Pellingbrook Kitchens',
	'Orrenshaw Travel',
	'Quillbury Garden Centre'
];
const PAYEES = [
	'Bramwell Roofing Services',
	'Kestrel Bridge Investments',
	'Thornley Motors (private sale)'
];

/** The claim the k-th disputant makes: the classification by cycle, the amount from the ordinal, above the limit every fifteenth. */
export function claimFor(customer: Customer, k: number): DisputeClaim {
	const cycle = k % 3;
	// The scams are the k ≡ 1 (mod 3) disputes; one in five of those (k ≡ 1 mod 15) is above the default limit.
	const aboveLimit = k % ABOVE_LIMIT_EVERY === 1;
	const base = 120 + ((k * 37) % 900);
	if (cycle === 0)
		return {
			transactionId: `txn-dispute-${customer.id}`,
			amount: base,
			channel: 'card-not-present',
			customerMadeIt: false,
			newPayee: false,
			merchant: MERCHANTS[k % MERCHANTS.length]!,
			customerSays: 'I did not make this payment.'
		};
	if (cycle === 1)
		return {
			transactionId: `txn-dispute-${customer.id}`,
			amount: aboveLimit ? 90_000 + base : 1_500 + base * 4,
			channel: 'faster-payment',
			customerMadeIt: true,
			newPayee: true,
			merchant: 'a private payee',
			payee: PAYEES[k % PAYEES.length]!,
			customerSays: 'I made the payment myself and the payee has vanished.'
		};
	return {
		transactionId: `txn-dispute-${customer.id}`,
		amount: base,
		channel: 'card-present',
		customerMadeIt: true,
		newPayee: false,
		merchant: MERCHANTS[k % MERCHANTS.length]!,
		customerSays: 'I paid for goods that never arrived.'
	};
}

export function disputesBook(pop: Population, options: DisputesBookOptions = {}): Book {
	const policy = options.policy ?? DEFAULT_DISPUTES_POLICY;
	const last = pop.options.periodDays - 1;
	const first =
		options.from !== undefined ? pop.transactions.indexOf(options.from) : Math.max(0, last - 29);
	const lastIndex = options.to !== undefined ? pop.transactions.indexOf(options.to) : last;
	const span = Math.max(1, lastIndex - first + 1);
	const items: WorkItem[] = [];
	for (const entry of pop.customers) {
		const ordinal = entry.ordinal;
		if ((ordinal + 1) % DISPUTES_EVERY !== 0) continue;
		const k = (ordinal + 1) / DISPUTES_EVERY;
		const customer: Customer = customerForTheDesk(entry.customer);
		const claim = claimFor(customer, k);
		const verdict = disputeVerdict(claim, true, policy);
		const scamPattern = verdict.classification === 'authorised-scam';
		const dayIndex = first + (ordinal % span);
		items.push({
			id: `dispute-${customer.id.replace(/^cust-/, '')}`,
			kind: 'dispute',
			customerId: customer.id,
			arrivedAt: `${pop.transactions.dateOf(dayIndex)}T${String(9 + (ordinal % 8)).padStart(2, '0')}:00:00.000Z`,
			payload: { claim, customer, investigation: investigationFor(claim), scamPattern },
			truth: {
				records: [
					{
						id: `dispute-truth-${customer.id}`,
						kind: 'verdict',
						title: 'What the rule says',
						fields: {
							verdict: `should-${verdict.verdict}`,
							classification: `class-${verdict.classification}`
						}
					}
				],
				facts: {
					verdict: `should-${verdict.verdict}`,
					classification: `class-${verdict.classification}`,
					amount: claim.amount,
					limit: policy.reimbursementLimit,
					scamPattern
				},
				cohort: {
					ageBand: entry.customer.cohort.ageBand,
					incomeBand: entry.customer.cohort.incomeBand
				}
			}
		});
	}
	return {
		schemaVersion: 1,
		kind: 'dispute',
		items,
		source: {
			populationDigest: pop.digest,
			seed: pop.seed,
			size: pop.options.size,
			filter: { from: options.from, to: options.to }
		}
	};
}

/** The book at a seed and size, the workflow's own (`WorkflowSpec.book`). */
export function disputesBookFor(request: {
	seed: number;
	size: number;
	periodDays?: number;
	policy?: DisputesPolicy;
}): Book {
	const pop = population(request.seed, {
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
	return disputesBook(pop, request.policy ? { policy: request.policy } : {});
}
