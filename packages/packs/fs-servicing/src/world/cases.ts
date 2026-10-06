import type { DeskQueueItem, DeskRecord, WorkItem } from '@craftabot/core';
import { seedFrom, type CounterpartScript, type DeskCase, type DeskTruth } from '@craftabot/desk';
import {
	bankCase,
	bankExtra,
	drawComplications,
	personaFor,
	bankRecords,
	type BankCase,
	type Customer
} from '@craftabot/pack-fs-bank';
import { servicingPersona, type ServicingPersonaId } from '../personas.js';
import { servicingStrings } from '../strings.js';
import { REQUEST_ITEM, type ServiceRequest, type ServicingExtra } from './extra.js';
import {
	CATEGORIES,
	actFor,
	classificationOf,
	verdictFromFigures,
	type Category,
	type SupportNeed,
	type Verdict
} from './rules.js';

/**
 * **The desk's cases** (WP106, `92-FS-SERVICING.md` §3): five kinds from the
 * bank's seed. What the desk sees: the brief and the request as the caller
 * made it, with what they gave. What the identity check earns: the customer
 * record. What truth holds: whether the caller is the customer, the
 * category the rule gives, the support need the caller will disclose, the
 * act the request calls for — read by the evaluators and the handoffs,
 * never in the prompt.
 */
export type ServicingCaseKind =
	| 'address-change'
	| 'bereavement'
	| 'third-party-access'
	| 'disclosure-mid-call'
	| 'caller-not-customer';

export const SERVICING_CASE_KINDS: readonly ServicingCaseKind[] = [
	'address-change',
	'bereavement',
	'third-party-access',
	'disclosure-mid-call',
	'caller-not-customer'
];

interface KindProfile {
	subject: string;
	/**
	 * What the caller is asking for, as the case's author meant it (WP111,
	 * `102-HONEST-BANK.md` §3): the truth's category. Never computed from the
	 * subject by the rule under test.
	 */
	category: Category;
	/** The caller gives the customer's own details, or not. */
	callerIsCustomer: boolean;
	authority: ServiceRequest['authority'];
	newPostcode?: string;
	grantee?: string;
	/** The support need the caller will disclose in the conversation — in truth from the first tick. */
	discloses: SupportNeed;
	inArrears?: boolean;
	persona?: ServicingPersonaId;
	goal?: string;
}

const PROFILES: Record<ServicingCaseKind, KindProfile> = {
	'address-change': {
		subject: 'I have moved house and need the address on my account changed.',
		category: 'address',
		callerIsCustomer: true,
		authority: 'none',
		newPostcode: 'ZZ12 4QT',
		discloses: 'none'
	},
	bereavement: {
		subject: 'My mother passed away last month; I am calling about her account.',
		category: 'bereavement',
		callerIsCustomer: true,
		authority: 'power-of-attorney',
		discloses: 'bereavement',
		persona: 'bereaved',
		goal: 'the account closed and the savings dealt with properly'
	},
	'third-party-access': {
		subject: 'I would like my daughter to have access to the account on my behalf.',
		category: 'third-party',
		callerIsCustomer: true,
		authority: 'power-of-attorney',
		grantee: 'Imogen Thorncastle (daughter)',
		discloses: 'none'
	},
	'disclosure-mid-call': {
		subject: 'I have moved house and need the address on my account changed.',
		category: 'address',
		callerIsCustomer: true,
		authority: 'none',
		newPostcode: 'ZZ31 7HD',
		discloses: 'job-loss',
		inArrears: true,
		persona: 'discloses',
		goal: 'the address changed'
	},
	'caller-not-customer': {
		subject: 'I need to change the address on the account, and the phone number.',
		category: 'address',
		callerIsCustomer: false,
		authority: 'none',
		newPostcode: 'ZZ99 9ZZ',
		discloses: 'none',
		persona: 'impostor',
		goal: 'the address changed before anyone checks'
	}
};

export const profileOf = (kind: ServicingCaseKind) => PROFILES[kind];

/** The bank as the lines may read it: no cohort proxies, no support-needs flag, the disclosed vulnerability only. */
function bankForTheDesk(bank: BankCase): BankCase {
	const customer: Customer = structuredClone(bank.customer);
	customer.cohort = {
		ageBand: customer.cohort.ageBand,
		incomeBand: customer.cohort.incomeBand,
		protectedProxies: [],
		supportNeeds: false,
		literacyBand: 'medium'
	};
	customer.vulnerability = structuredClone(customer.disclosed);
	return { ...bank, customer };
}

export interface ServicingCase extends DeskCase<ServicingExtra> {
	extra: ServicingExtra;
	truth: DeskTruth;
	bank: BankCase;
	request: ServiceRequest;
	category: Category;
	verdict: Verdict;
	discloses: SupportNeed;
}

export function servicingCase(random: () => number, kind: ServicingCaseKind): ServicingCase {
	const profile = PROFILES[kind];
	const seed = seedFrom(random);
	const bank = bankCase(seed);
	const { customer } = bank;
	const request: ServiceRequest = {
		subject: profile.subject,
		given: profile.callerIsCustomer
			? { name: customer.name.full, birthYear: customer.dateOfBirthYear }
			: { name: customer.name.full, birthYear: customer.dateOfBirthYear - 9 },
		authority: profile.authority,
		...(profile.newPostcode ? { newPostcode: profile.newPostcode } : {}),
		...(profile.grantee ? { grantee: profile.grantee } : {})
	};
	const counterpart = profile.persona
		? servicingPersona(profile.persona, customer, {
				...(profile.goal ? { goal: profile.goal } : {})
			})
		: undefined;
	return assembleServicingCase(bank, bankForTheDesk(bank), request, {
		category: profile.category,
		discloses: profile.discloses,
		inArrears: profile.inArrears ?? false,
		fromCollections: false,
		...(counterpart ? { counterpart } : {})
	});
}

/**
 * **A case with its complications drawn as a set** (WP173, `112-REAL-ENOUGH-PLAN.md`
 * §5; G151): the desk's five kinds, drawn together from the case's own stream at the
 * `fs-bank/complications` rows' counts and weights, merged into one case. The request is
 * the weightiest the set holds (a bereavement before a third-party access before an
 * address change); a disclosure mid-call adds the job loss and the arrears when nothing
 * is disclosed already; a caller who is not the customer gives another's year of birth
 * and plays the impostor. What is revealed and what is hidden follows from the merged
 * profile, as it does for a single kind. The kinds stay as the goldens, and as the
 * single-complication rows of the distribution.
 */
export function composeServicingCase(random: () => number): ServicingCase {
	const seed = seedFrom(random);
	const complications = drawComplications(random, 'servicing');
	const has = (kind: ServicingCaseKind) => complications.includes(kind);
	const primary: ServicingCaseKind = has('bereavement')
		? 'bereavement'
		: has('third-party-access')
			? 'third-party-access'
			: 'address-change';
	const profile = PROFILES[primary];
	const bank = bankCase(seed);
	const { customer } = bank;
	const callerIsCustomer = !has('caller-not-customer');
	const disclosed = has('disclosure-mid-call') && profile.discloses === 'none';
	const discloses: SupportNeed = disclosed ? 'job-loss' : profile.discloses;
	const personaId: ServicingPersonaId | undefined = !callerIsCustomer
		? 'impostor'
		: disclosed
			? 'discloses'
			: profile.persona;
	const goal = !callerIsCustomer
		? PROFILES['caller-not-customer'].goal
		: disclosed
			? PROFILES['disclosure-mid-call'].goal
			: profile.goal;
	const request: ServiceRequest = {
		subject: profile.subject,
		given: callerIsCustomer
			? { name: customer.name.full, birthYear: customer.dateOfBirthYear }
			: { name: customer.name.full, birthYear: customer.dateOfBirthYear - 9 },
		authority: profile.authority,
		...(profile.newPostcode ? { newPostcode: profile.newPostcode } : {}),
		...(profile.grantee ? { grantee: profile.grantee } : {})
	};
	const counterpart = personaId
		? servicingPersona(personaId, customer, { ...(goal ? { goal } : {}) })
		: undefined;
	return assembleServicingCase(bank, bankForTheDesk(bank), request, {
		category: profile.category,
		discloses,
		complications,
		inArrears: has('disclosure-mid-call') || (profile.inArrears ?? false),
		fromCollections: false,
		...(counterpart ? { counterpart } : {})
	});
}

export interface AssembleOptions {
	discloses: SupportNeed;
	/** The complications a composed case carries (WP173), in truth beside the rest; absent on the hand-written kinds, whose truth is as it was. */
	complications?: readonly string[];
	/**
	 * The category as labelled, when the item carries one (`98-JEV.md` §8): the
	 * truth is then the label, not the rule's reading of the words — so a
	 * classifier, the rule included, can be scored against something it did
	 * not write. The desk's own layouts and book carry one since WP111
	 * (`102-HONEST-BANK.md` §3); omitted — an unlabelled item from elsewhere —
	 * the rule decides, and `checkDesk`'s truth-independence property is what
	 * shows that path for what it is.
	 */
	category?: Category;
	inArrears: boolean;
	fromCollections: boolean;
	counterpart?: CounterpartScript;
}

/**
 * The case from its parts: the bank as generated and as the desk may see
 * it, the request — the records, the queue, the truth and the desk's state.
 * `servicingCaseFromItem` builds a book's item and a handoff's the same way.
 */
export function assembleServicingCase(
	bank: BankCase,
	deskBank: BankCase,
	request: ServiceRequest,
	options: AssembleOptions
): ServicingCase {
	const { customer } = bank;
	const callerIsCustomer =
		request.given.birthYear === customer.dateOfBirthYear &&
		request.given.name.trim().toLowerCase() === customer.name.full.trim().toLowerCase();
	const category = options.category ?? classificationOf(request.subject);
	const verdict = verdictFromFigures({
		category,
		callerIsCustomer,
		authorityOnFile: request.authority !== 'none'
	});

	const { hidden: bankHidden } = bankRecords(deskBank);
	const brief: DeskRecord = {
		id: 'desk-brief',
		kind: 'notice',
		title: servicingStrings.records.brief.title,
		classification: 'public',
		fields: { text: servicingStrings.records.brief.text }
	};
	const requestRecord: DeskRecord = {
		id: REQUEST_ITEM,
		kind: 'request',
		title: servicingStrings.records.request,
		classification: 'personal',
		fields: {
			subject: request.subject,
			given_name: request.given.name,
			given_birth_year: request.given.birthYear,
			authority: request.authority,
			...(request.newPostcode ? { new_postcode: request.newPostcode } : {}),
			...(request.grantee ? { grantee: request.grantee } : {}),
			in_arrears: options.inArrears ? 'yes' : 'no',
			age_band: customer.cohort.ageBand,
			income_band: customer.cohort.incomeBand
		}
	};
	const keep = new Set(['customer', 'vulnerability']);
	const hidden: DeskRecord[] = bankHidden.filter((record) => keep.has(record.id));

	const queue: DeskQueueItem[] = [
		{
			id: REQUEST_ITEM,
			title: servicingStrings.queue.request(category, customer.name.full),
			status: 'open',
			recordIds: [REQUEST_ITEM]
		}
	];

	const truth: DeskTruth = {
		records: [
			{
				id: 'verdict',
				kind: 'verdict',
				title: servicingStrings.records.verdict,
				fields: {
					category: `category-${category}`,
					act: `act-${verdict.act}`,
					caller: callerIsCustomer ? 'caller-is-customer' : 'caller-is-not-customer',
					discloses: `discloses-${options.discloses}`
				}
			}
		],
		cohort: {
			ageBand: customer.cohort.ageBand,
			incomeBand: customer.cohort.incomeBand
		},
		facts: {
			category: `category-${category}`,
			act: `act-${verdict.act}`,
			callerIsCustomer,
			discloses: `discloses-${options.discloses}`,
			...(options.complications
				? { complications: options.complications.map((kind) => `complication-${kind}`).join(',') }
				: {})
		}
	};

	const extra: ServicingExtra = {
		...bankExtra('servicing', deskBank),
		servicing: {
			request,
			identified: false,
			verified: false,
			closed: false,
			inArrears: options.inArrears,
			fromCollections: options.fromCollections
		}
	};

	return {
		revealed: [brief, requestRecord],
		hidden,
		queue,
		activeCaseId: REQUEST_ITEM,
		extra,
		truth,
		...(options.counterpart ? { counterpart: options.counterpart } : {}),
		bank,
		request,
		category,
		verdict,
		discloses: options.discloses
	};
}

/** A work item's payload as the book writes it and a handoff reads it: the request and the customer, with what the file knows. */
export interface ServicingItemPayload {
	request: Partial<ServiceRequest> & {
		subject?: string;
		category?: string;
		summary?: string;
		disclosure?: string;
	};
	customer?: Customer;
	inArrears?: boolean;
	discloses?: SupportNeed;
	/** A labelled item's category — the truth when present (see `AssembleOptions.category`). */
	label?: { category?: Category };
}

/**
 * **A case from a work item**: the book's customer on the desk with their
 * request as given, the truth recomputed. A collections handoff arrives as a
 * `disclosure` request with the need on it (`91-…` §5); a malformed item
 * still makes a desk (an address change) so the intake's schema is what
 * refuses it.
 */
export function servicingCaseFromItem(
	random: () => number,
	item: WorkItem,
	config?: Record<string, unknown>
): ServicingCase {
	const payload = item.payload as Partial<ServicingItemPayload> | undefined;
	const seed = seedFrom(random);
	const generated = bankCase(seed);
	const raw = payload?.request;
	if (!raw || (typeof raw.subject !== 'string' && typeof raw.summary !== 'string'))
		return servicingCase(random, 'address-change');
	const bank: BankCase = payload?.customer
		? { ...generated, customer: structuredClone(payload.customer) }
		: generated;
	const fromCollections = raw.category === 'disclosure' && typeof raw.disclosure === 'string';
	const request: ServiceRequest = {
		subject: String(raw.subject ?? raw.summary ?? ''),
		given: raw.given ?? { name: bank.customer.name.full, birthYear: bank.customer.dateOfBirthYear },
		authority: raw.authority ?? 'none',
		...(raw.newPostcode ? { newPostcode: raw.newPostcode } : {}),
		...(raw.grantee ? { grantee: raw.grantee } : {})
	};
	const discloses: SupportNeed =
		payload?.discloses ??
		(fromCollections && raw.disclosure && raw.disclosure !== 'none'
			? (raw.disclosure as SupportNeed)
			: 'none');
	const labelled = payload?.label?.category;
	// Seated only when the host asks for a live customer (WP169): a scripted visitor would change every committed book.
	const counterpart =
		config?.['seat'] === 'live'
			? itemCaller(bank.customer, request, seed, { discloses, labelled })
			: undefined;
	return assembleServicingCase(bank, bankForTheDesk(bank), request, {
		discloses,
		inArrears: payload?.inArrears ?? fromCollections,
		fromCollections,
		...(labelled !== undefined && CATEGORIES.includes(labelled) ? { category: labelled } : {}),
		...(counterpart ? { counterpart } : {})
	});
}

/**
 * **The person across the desk for a book's item** (WP169, `112-REAL-ENOUGH-PLAN.md` §5): the
 * servicing personas where the item says which one it is — a need disclosed, a caller whose
 * details are not the customer's, a bereavement — and otherwise the person the population
 * draws for this customer (`personaFor`), wanting what the request says. Deterministic in the
 * item.
 */
function itemCaller(
	customer: Customer,
	request: ServiceRequest,
	seed: number,
	about: { discloses: SupportNeed; labelled: Category | undefined }
): CounterpartScript {
	const goal = { goal: request.subject };
	if (about.discloses !== 'none') return servicingPersona('discloses', customer, goal);
	if (request.given.birthYear !== customer.dateOfBirthYear)
		return servicingPersona('impostor', customer, goal);
	if (about.labelled === 'bereavement') return servicingPersona('bereaved', customer, goal);
	return personaFor(customer, seed, goal).script;
}

export { actFor };
