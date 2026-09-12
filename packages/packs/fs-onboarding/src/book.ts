import type { Book, WorkItem } from '@craftabot/core';
import {
	SCREENING_LIST,
	customerForTheDesk,
	population,
	type Customer,
	type Population
} from '@craftabot/pack-fs-bank';
import type { OnboardingApplication } from './world/extra.js';
import { onboardingVerdict } from './world/rules.js';

/**
 * **The onboarding book** (WP103, `95-FS-ONBOARDING.md` §5): the
 * population's applicants as account applications — every twelfth
 * customer in ordinal order applies once across the window (a synthetic
 * incidence, stated here and not calibrated), each with the rule's verdict
 * in truth. Every fifth applicant takes an identity from the bank's lists,
 * so a book of any size carries screening matches; every eighth gives a
 * year of birth that does not match the document. The bank cannot import
 * the rule, so the desk judges its own book.
 */
export interface OnboardingBookOptions {
	from?: string;
	to?: string;
}

const APPLIES_EVERY = 12;
const HIT_EVERY = 5;
const MISMATCH_EVERY = 8;

function listedAs(applicant: number): (Customer['name'] & { birthYear: number }) | undefined {
	if (applicant % HIT_EVERY !== 0) return undefined;
	const entry = SCREENING_LIST[(applicant / HIT_EVERY) % SCREENING_LIST.length]!;
	return {
		given: entry.given,
		family: entry.family,
		full: `${entry.given} ${entry.family}`,
		birthYear: entry.birthYear
	};
}

export function onboardingBook(pop: Population, options: OnboardingBookOptions = {}): Book {
	const last = pop.options.periodDays - 1;
	const first =
		options.from !== undefined ? pop.transactions.indexOf(options.from) : Math.max(0, last - 29);
	const lastIndex = options.to !== undefined ? pop.transactions.indexOf(options.to) : last;
	const span = Math.max(1, lastIndex - first + 1);
	const items: WorkItem[] = [];
	for (const entry of pop.customers) {
		const ordinal = entry.ordinal;
		if ((ordinal + 1) % APPLIES_EVERY !== 0) continue;
		const applicant = (ordinal + 1) / APPLIES_EVERY;
		const customer: Customer = customerForTheDesk(entry.customer);
		const listed = listedAs(applicant);
		if (listed) {
			customer.name = { given: listed.given, family: listed.family, full: listed.full };
			customer.dateOfBirthYear = listed.birthYear;
		}
		const mismatch = applicant % MISMATCH_EVERY === 0;
		const application: OnboardingApplication = {
			productKind: ordinal % 3 === 0 ? 'savings' : 'current',
			purpose: ordinal % 3 === 0 ? 'savings' : 'everyday banking',
			given: mismatch
				? { birthYear: customer.dateOfBirthYear - 7, postcode: 'ZZ99 9ZZ' }
				: { birthYear: customer.dateOfBirthYear, postcode: customer.address.postcode }
		};
		const verdict = onboardingVerdict(customer, !mismatch);
		const dayIndex = first + (ordinal % span);
		items.push({
			id: `onboarding-${customer.id.replace(/^cust-/, '')}`,
			kind: 'onboarding',
			customerId: customer.id,
			arrivedAt: `${pop.transactions.dateOf(dayIndex)}T${String(9 + (ordinal % 8)).padStart(2, '0')}:00:00.000Z`,
			payload: { application, applicant: { customer } },
			truth: {
				records: [
					{
						id: `onboarding-truth-${customer.id}`,
						kind: 'verdict',
						title: 'What the rule says',
						fields: {
							verdict: `should-${verdict.verdict}`,
							hit: `list-${verdict.screening}`,
							rating: `rated-${verdict.rating}`
						}
					}
				],
				facts: {
					verdict: `should-${verdict.verdict}`,
					hit: `list-${verdict.screening}`,
					rating: `rated-${verdict.rating}`,
					verifies: !mismatch
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
		kind: 'onboarding',
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
export function onboardingBookFor(request: {
	seed: number;
	size: number;
	periodDays?: number;
}): Book {
	const pop = population(request.seed, {
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
	return onboardingBook(pop);
}
