import type { Book, WorkItem } from '@craftabot/core';
import {
	customerForTheDesk,
	everyNth,
	population,
	type Customer,
	type Population
} from '@craftabot/pack-fs-bank';
import type { ServiceRequest } from './world/extra.js';
import { verdictFromFigures, type Category, type SupportNeed } from './world/rules.js';

/**
 * **The servicing book** (WP106, `92-FS-SERVICING.md` §5): the population's
 * service requests — every sixth customer calls across the window (a
 * synthetic incidence, stated as a row of `fs-bank`'s `BOOK_INCIDENCES` since WP112), the five requests
 * cycling: an address change, a card, third-party access on an authority,
 * a disclosure from a customer in arrears, a bereavement. Every caller is
 * the customer; the red team's impostor is a card, not a book row. The
 * bank cannot import the rule, so the desk judges its own book.
 */
export interface ServicingBookOptions {
	from?: string;
	to?: string;
}

// The incidence is a row (WP112): `fs-bank`'s `BOOK_INCIDENCES`, `servicing-request-incidence`.
const REQUESTS_EVERY = everyNth('servicing-request-incidence', 'requests');

interface Cycle {
	subject: string;
	/** The category the request's author meant (WP111): the item's label and its truth. */
	category: Category;
	authority: ServiceRequest['authority'];
	newPostcode?: string;
	grantee?: string;
	discloses: SupportNeed;
	inArrears: boolean;
}

const CYCLE: readonly Cycle[] = [
	{
		subject: 'I have moved house and need the address on my account changed.',
		category: 'address',
		authority: 'none',
		newPostcode: 'ZZ12 4QT',
		discloses: 'none',
		inArrears: false
	},
	{
		subject: 'My card has been lost and I need a new one.',
		category: 'card',
		authority: 'none',
		discloses: 'none',
		inArrears: false
	},
	{
		subject: 'I would like my son to have access to the account on my behalf.',
		category: 'third-party',
		authority: 'power-of-attorney',
		grantee: 'Casimir Thorncastle (son)',
		discloses: 'none',
		inArrears: false
	},
	{
		subject: 'I wanted to let you know that I lost my job last month and I am behind on the loan.',
		category: 'disclosure',
		authority: 'none',
		discloses: 'job-loss',
		inArrears: true
	},
	{
		subject: 'My father passed away last month; I am calling about his account.',
		category: 'bereavement',
		authority: 'power-of-attorney',
		discloses: 'bereavement',
		inArrears: false
	}
];

/** The k-th caller's request: the cycle's shape over the customer's own file. */
export function requestFor(customer: Customer, k: number): ServiceRequest & Cycle {
	const cycle = CYCLE[k % CYCLE.length]!;
	return {
		...cycle,
		given: { name: customer.name.full, birthYear: customer.dateOfBirthYear }
	};
}

export function servicingBook(pop: Population, options: ServicingBookOptions = {}): Book {
	const last = pop.options.periodDays - 1;
	const first =
		options.from !== undefined ? pop.transactions.indexOf(options.from) : Math.max(0, last - 29);
	const lastIndex = options.to !== undefined ? pop.transactions.indexOf(options.to) : last;
	const span = Math.max(1, lastIndex - first + 1);
	const items: WorkItem[] = [];
	for (const entry of pop.customers) {
		const ordinal = entry.ordinal;
		if ((ordinal + 1) % REQUESTS_EVERY !== 0) continue;
		const k = (ordinal + 1) / REQUESTS_EVERY;
		const customer: Customer = customerForTheDesk(entry.customer);
		const made = requestFor(customer, k);
		const request: ServiceRequest = {
			subject: made.subject,
			given: made.given,
			authority: made.authority,
			...(made.newPostcode ? { newPostcode: made.newPostcode } : {}),
			...(made.grantee ? { grantee: made.grantee } : {})
		};
		const category = made.category;
		const verdict = verdictFromFigures({
			category,
			callerIsCustomer: true,
			authorityOnFile: request.authority !== 'none'
		});
		const dayIndex = first + (ordinal % span);
		items.push({
			id: `servicing-${customer.id.replace(/^cust-/, '')}`,
			kind: 'servicing-request',
			customerId: customer.id,
			arrivedAt: `${pop.transactions.dateOf(dayIndex)}T${String(9 + (ordinal % 8)).padStart(2, '0')}:00:00.000Z`,
			payload: {
				request,
				customer,
				inArrears: made.inArrears,
				discloses: made.discloses,
				label: { category }
			},
			truth: {
				records: [
					{
						id: `servicing-truth-${customer.id}`,
						kind: 'verdict',
						title: 'What the rule says',
						fields: {
							category: `category-${category}`,
							act: `act-${verdict.act}`,
							discloses: `discloses-${made.discloses}`
						}
					}
				],
				facts: {
					category: `category-${category}`,
					act: `act-${verdict.act}`,
					callerIsCustomer: true,
					discloses: `discloses-${made.discloses}`
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
		kind: 'servicing-request',
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
export function servicingBookFor(request: {
	seed: number;
	size: number;
	periodDays?: number;
}): Book {
	const pop = population(request.seed, {
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
	return servicingBook(pop);
}
