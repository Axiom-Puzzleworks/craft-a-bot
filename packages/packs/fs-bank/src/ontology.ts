import type { BankExtra, BankPurpose } from './extra.js';
import type { Account, BankCase, Complaint, Customer, Product, Transaction } from './model.js';
import { BANK_CONTROL_ROWS } from './controls/rows.js';
import { OBLIGATION_TAGS } from './obligations.js';
import { PURPOSE_ALLOWS_SPECIAL_CATEGORY } from './lines/shared.js';
import { driverList, hasAnyDriver } from './records.js';

/**
 * **The bank's ontology** (WP81, `70-CONTEXT-AND-ONTOLOGY.md` §5;
 * `64-TARGET-DESIGN-V5.md` §6.3.2): the bank's entities and relationships
 * as a typed property graph, generated from a case and never stored. Two
 * things make it an ontology rather than a JSON dump: the classes include
 * the *governance* entities — an `Obligation` is related to the `Control`
 * rows that evidence it and to the `Desk`s it governs — so a bot can be
 * asked to cite the obligation its action serves; and relations carry
 * `purposes`, so a traversal a purpose does not allow is refused with the
 * lines' own finding. A special-category class's instances never enter a
 * card or an answer for a purpose that may not read them.
 */
export type OntologyScope = 'customer' | 'bank';
export type AttributeValue = string | number | boolean;

export interface OntologyClass {
	description: string;
	attributes: string[];
	specialCategory?: boolean;
}
export interface OntologyRelation {
	from: string;
	to: string;
	description: string;
	/** The purposes that may traverse it; every purpose when absent. */
	purposes?: string[];
}
export interface OntologyInstance {
	id: string;
	class: string;
	attributes: Record<string, AttributeValue>;
}
export interface OntologyEdge {
	from: string;
	relation: string;
	to: string;
}
export interface Ontology {
	classes: Record<string, OntologyClass>;
	relations: Record<string, OntologyRelation>;
	instances(scope: OntologyScope): Iterable<OntologyInstance>;
	edges(scope: OntologyScope): Iterable<OntologyEdge>;
}

export const ONTOLOGY_CLASSES: Readonly<Record<string, OntologyClass>> = {
	Customer: {
		description: 'A person the bank serves.',
		attributes: ['name', 'employment', 'tenure_years', 'dependants', 'age_band', 'income_band']
	},
	Account: {
		description: 'An account the customer holds.',
		attributes: ['kind', 'balance', 'status', 'opened', 'credit_limit']
	},
	Transaction: {
		description: 'One movement on an account.',
		attributes: ['day', 'amount', 'direction', 'merchant', 'channel', 'country']
	},
	Product: {
		description: 'A product on the shelf.',
		attributes: ['name', 'category', 'risk_band', 'price_bps', 'needs_advice']
	},
	Application: {
		description: 'A loan application on a desk.',
		attributes: ['amount', 'term_months', 'purpose']
	},
	Decision: {
		description: 'What a desk decided about an application.',
		attributes: ['outcome', 'reasons']
	},
	Complaint: {
		description: 'A complaint the customer raised.',
		attributes: ['category', 'status', 'opened_day']
	},
	Alert: {
		description: 'A fraud alert raised on an account.',
		attributes: ['severity', 'text']
	},
	BureauFile: {
		description: 'The credit bureau’s file on the customer.',
		attributes: ['score_band', 'defaults', 'arrears_months', 'searches_12m', 'disposable']
	},
	Vulnerability: {
		description:
			'What the customer has told the bank about their circumstances — special-category data.',
		attributes: ['drivers'],
		specialCategory: true
	},
	Obligation: {
		description: 'A regulatory obligation the bank carries, by its tag.',
		attributes: ['text']
	},
	Control: {
		description: 'A control-map row that evidences an obligation.',
		attributes: ['framework', 'title', 'status']
	},
	ServiceLine: {
		description: 'A service line a desk reaches through the Connector.',
		attributes: ['name']
	},
	Desk: {
		description: 'A desk, by the purpose it serves.',
		attributes: ['purpose']
	}
};

export const ONTOLOGY_RELATIONS: Readonly<Record<string, OntologyRelation>> = {
	holds: { from: 'Customer', to: 'Account', description: 'The customer holds the account.' },
	transacted: { from: 'Account', to: 'Transaction', description: 'The account saw the movement.' },
	holdsProduct: { from: 'Customer', to: 'Product', description: 'The customer holds the product.' },
	eligibleFor: {
		from: 'Customer',
		to: 'Product',
		description: 'The product’s eligibility rules admit the customer.'
	},
	appliedFor: { from: 'Customer', to: 'Application', description: 'The customer applied.' },
	decided: {
		from: 'Application',
		to: 'Decision',
		description: 'The desk decided the application.'
	},
	complainedAbout: { from: 'Customer', to: 'Complaint', description: 'The customer complained.' },
	hasFile: {
		from: 'Customer',
		to: 'BureauFile',
		description: 'The bureau holds a file on the customer.'
	},
	discloses: {
		from: 'Customer',
		to: 'Vulnerability',
		description: 'What the customer has disclosed — for the purposes that may read it.',
		purposes: [...PURPOSE_ALLOWS_SPECIAL_CATEGORY]
	},
	governedBy: {
		from: 'Desk',
		to: 'Obligation',
		description: 'The desk works under the obligation.'
	},
	evidencedBy: {
		from: 'Obligation',
		to: 'Control',
		description: 'The control row evidences the obligation.'
	},
	reaches: { from: 'Desk', to: 'ServiceLine', description: 'The desk reaches the line.' }
};

/** Which obligations each purpose works under — the control rows' tags, grouped by the desk that evidences them. */
const DESK_OBLIGATIONS: Readonly<Record<BankPurpose, string[]>> = {
	advice: [
		'fca:cd:products-services',
		'fca:cd:price-value',
		'fca:cd:understanding',
		'fca:cd:support',
		'fca:cobs-9:suitability',
		'fca:cobs-4:promotions',
		'fca:fg21-1:vulnerability',
		'ukgdpr:data-minimisation'
	],
	'fraud-operations': ['poca:tipping-off', 'mlr:kyc', 'fca:cd:support', 'pra:ss1-21:resilience'],
	lending: [
		'fca:conc:creditworthiness',
		'fca:conc:affordability',
		'fca:cd:understanding',
		'equality-act:fairness',
		'mlr:kyc'
	],
	complaints: ['fca:disp:complaints', 'fca:cd:support', 'fca:cd:understanding'],
	onboarding: ['mlr:kyc', 'mlr:screening', 'poca:tipping-off', 'ukgdpr:data-minimisation'],
	disputes: ['psr:app-reimbursement', 'fca:cd:support', 'fca:cd:understanding', 'mlr:kyc'],
	reception: ['ukgdpr:purpose-limitation'],
	testing: []
};

const money = (value: number): number => Math.round(value);

function customerInstance(customer: Customer): OntologyInstance {
	return {
		id: customer.id,
		class: 'Customer',
		attributes: {
			name: customer.name.full,
			employment: customer.employment,
			tenure_years: customer.tenureYears,
			dependants: customer.dependants,
			age_band: customer.cohort.ageBand,
			income_band: customer.cohort.incomeBand
		}
	};
}
function accountInstance(account: Account): OntologyInstance {
	return {
		id: `account-${account.id}`,
		class: 'Account',
		attributes: {
			kind: account.kind,
			balance: money(account.balance),
			status: account.status,
			opened: account.openedYear,
			...(account.creditLimit !== undefined ? { credit_limit: account.creditLimit } : {})
		}
	};
}
function transactionInstance(transaction: Transaction): OntologyInstance {
	return {
		id: `transaction-${transaction.id}`,
		class: 'Transaction',
		attributes: {
			day: transaction.day,
			amount: money(transaction.amount),
			direction: transaction.direction,
			merchant: transaction.merchant,
			channel: transaction.channel,
			country: transaction.country
		}
	};
}
function productInstance(product: Product): OntologyInstance {
	return {
		id: product.id.replace('fs-bank/product/', 'product-'),
		class: 'Product',
		attributes: {
			name: product.name,
			category: product.category,
			risk_band: product.riskBand,
			price_bps: product.priceBps,
			needs_advice: product.eligibility.needsAdvice === true
		}
	};
}
function complaintInstance(complaint: Complaint): OntologyInstance {
	return {
		id: `complaint-${complaint.id}`,
		class: 'Complaint',
		attributes: {
			category: complaint.category,
			status: complaint.status,
			opened_day: complaint.openedDay
		}
	};
}

/** The last movements per account, the same window the records show. */
const RECENT = 8;

/** A lending desk's application and decision, when the case is one (`70-…` §8). */
function lendingInstances(
	extra: BankExtra,
	customerId: string
): { instances: OntologyInstance[]; edges: OntologyEdge[] } {
	const lending = (extra as { lending?: unknown }).lending as
		| {
				application?: { amount: number; termMonths: number; purpose: string };
				decision?: { outcome: string; reasons: string[] };
		  }
		| undefined;
	if (!lending?.application) return { instances: [], edges: [] };
	const instances: OntologyInstance[] = [
		{
			id: 'application',
			class: 'Application',
			attributes: {
				amount: lending.application.amount,
				term_months: lending.application.termMonths,
				purpose: lending.application.purpose
			}
		}
	];
	const edges: OntologyEdge[] = [{ from: customerId, relation: 'appliedFor', to: 'application' }];
	if (lending.decision) {
		instances.push({
			id: 'decision',
			class: 'Decision',
			attributes: { outcome: lending.decision.outcome, reasons: lending.decision.reasons.join(',') }
		});
		edges.push({ from: 'application', relation: 'decided', to: 'decision' });
	}
	return { instances, edges };
}

/**
 * The ontology over one case (`70-…` §5): the `customer` scope is the case's
 * customer and everything a relation away; the `bank` scope adds the shelf
 * and the governance entities — the obligations, the control rows that
 * evidence them, the lines, the desks. `lineIds` names the lines the bank
 * ships (handed in, since the graph line is one of them).
 */
export function bankOntology(
	extra: BankExtra,
	options: { lineIds?: readonly string[] } = {}
): Ontology {
	const bank: BankCase = extra.bank;
	const customer = bank.customer;
	const lineIds = options.lineIds ?? [];

	function customerScope(): { instances: OntologyInstance[]; edges: OntologyEdge[] } {
		const instances: OntologyInstance[] = [customerInstance(customer)];
		const edges: OntologyEdge[] = [];
		for (const account of bank.accounts) {
			instances.push(accountInstance(account));
			edges.push({ from: customer.id, relation: 'holds', to: `account-${account.id}` });
			const recent = bank.transactions.filter((t) => t.accountId === account.id).slice(-RECENT);
			for (const transaction of recent) {
				instances.push(transactionInstance(transaction));
				edges.push({
					from: `account-${account.id}`,
					relation: 'transacted',
					to: `transaction-${transaction.id}`
				});
			}
		}
		for (const complaint of bank.complaints) {
			instances.push(complaintInstance(complaint));
			edges.push({
				from: customer.id,
				relation: 'complainedAbout',
				to: `complaint-${complaint.id}`
			});
		}
		instances.push({
			id: 'bureau',
			class: 'BureauFile',
			attributes: {
				score_band: bank.bureau.scoreBand,
				defaults: bank.bureau.defaults,
				arrears_months: bank.bureau.arrearsMonths,
				searches_12m: bank.bureau.searchesLast12m,
				disposable: bank.bureau.affordability.disposable
			}
		});
		edges.push({ from: customer.id, relation: 'hasFile', to: 'bureau' });
		if (hasAnyDriver(customer.disclosed)) {
			instances.push({
				id: 'vulnerability',
				class: 'Vulnerability',
				attributes: { drivers: driverList(customer.disclosed) }
			});
			edges.push({ from: customer.id, relation: 'discloses', to: 'vulnerability' });
		}
		const held = new Set(extra.ledger.orders.map((order) => order.productId));
		for (const product of bank.shelf) {
			if (!held.has(product.id)) continue;
			instances.push(productInstance(product));
			edges.push({ from: customer.id, relation: 'holdsProduct', to: productInstance(product).id });
		}
		const lending = lendingInstances(extra, customer.id);
		instances.push(...lending.instances);
		edges.push(...lending.edges);
		return { instances, edges };
	}

	function bankScope(): { instances: OntologyInstance[]; edges: OntologyEdge[] } {
		const base = customerScope();
		const instances = [...base.instances];
		const edges = [...base.edges];
		const seen = new Set(instances.map((instance) => instance.id));
		for (const product of bank.shelf) {
			const instance = productInstance(product);
			if (!seen.has(instance.id)) {
				instances.push(instance);
				seen.add(instance.id);
			}
			const age = new Date().getUTCFullYear() - customer.dateOfBirthYear;
			if (age >= product.eligibility.minAge) {
				edges.push({ from: customer.id, relation: 'eligibleFor', to: instance.id });
			}
		}
		const desk: OntologyInstance = {
			id: `desk-${extra.purpose}`,
			class: 'Desk',
			attributes: { purpose: extra.purpose }
		};
		instances.push(desk);
		for (const tag of DESK_OBLIGATIONS[extra.purpose] ?? []) {
			const text = OBLIGATION_TAGS[tag];
			if (text === undefined) continue;
			const id = `obligation-${tag}`;
			if (!seen.has(id)) {
				instances.push({ id, class: 'Obligation', attributes: { text } });
				seen.add(id);
			}
			edges.push({ from: desk.id, relation: 'governedBy', to: id });
			for (const row of BANK_CONTROL_ROWS) {
				if (!row.tags.includes(tag)) continue;
				const controlId = `control-${row.ref}`;
				if (!seen.has(controlId)) {
					instances.push({
						id: controlId,
						class: 'Control',
						attributes: {
							framework: row.framework,
							title: row.title,
							status: row.status ?? 'unreviewed'
						}
					});
					seen.add(controlId);
				}
				edges.push({ from: id, relation: 'evidencedBy', to: controlId });
			}
		}
		for (const lineId of lineIds) {
			const id = `line-${lineId.slice(lineId.lastIndexOf('/') + 1)}`;
			instances.push({ id, class: 'ServiceLine', attributes: { name: lineId } });
			edges.push({ from: desk.id, relation: 'reaches', to: id });
		}
		return { instances, edges };
	}

	return {
		classes: ONTOLOGY_CLASSES,
		relations: ONTOLOGY_RELATIONS,
		instances: (scope) => (scope === 'bank' ? bankScope() : customerScope()).instances,
		edges: (scope) => (scope === 'bank' ? bankScope() : customerScope()).edges
	};
}

/**
 * Whether a purpose may see an instance and follow an edge (`70-…` §5):
 * a special-category class's instances only when asked for by name
 * (`specialCategory`) *and* the purpose allows — a card or a plain answer
 * never carries one, as the lines never carry one with plain arguments.
 */
function visible(ont: Ontology, purpose: string, specialCategory = false) {
	const mayReadClass = (name: string): boolean =>
		!ont.classes[name]?.specialCategory ||
		(specialCategory && PURPOSE_ALLOWS_SPECIAL_CATEGORY.has(purpose as BankPurpose));
	const mayFollow = (relation: string): boolean => {
		const purposes = ont.relations[relation]?.purposes;
		return purposes === undefined || purposes.includes(purpose);
	};
	return { mayReadClass, mayFollow };
}

export interface CardOptions {
	relations?: string[];
	budgetTokens?: number;
	scope?: OntologyScope;
	/** Asked for by name: a special-category class's instances may be reached, when the purpose allows. Never set by a card. */
	specialCategory?: boolean;
}

/** The instances and edges reachable from `root` within `depth` relations, under the purpose, in id order — the shared walk. */
export function neighbourhood(
	ont: Ontology,
	root: string,
	depth: number,
	purpose: string,
	options: CardOptions = {}
): { instances: OntologyInstance[]; edges: OntologyEdge[] } {
	const scope = options.scope ?? 'customer';
	const { mayReadClass, mayFollow } = visible(ont, purpose, options.specialCategory === true);
	const byId = new Map<string, OntologyInstance>();
	for (const instance of ont.instances(scope)) byId.set(instance.id, instance);
	const allowedRelations = options.relations ? new Set(options.relations) : undefined;
	const edges = [...ont.edges(scope)].filter(
		(edge) =>
			mayFollow(edge.relation) &&
			(allowedRelations === undefined || allowedRelations.has(edge.relation)) &&
			mayReadClass(byId.get(edge.from)?.class ?? '') &&
			mayReadClass(byId.get(edge.to)?.class ?? '')
	);
	const reached = new Set<string>();
	const kept: OntologyEdge[] = [];
	const rootInstance = byId.get(root);
	if (!rootInstance || !mayReadClass(rootInstance.class)) return { instances: [], edges: [] };
	let frontier = [root];
	reached.add(root);
	for (let step = 0; step < depth && frontier.length > 0; step += 1) {
		const next: string[] = [];
		for (const id of frontier) {
			for (const edge of edges) {
				const other = edge.from === id ? edge.to : edge.to === id ? edge.from : undefined;
				if (other === undefined || !byId.has(other)) continue;
				if (!kept.includes(edge)) kept.push(edge);
				if (!reached.has(other)) {
					reached.add(other);
					next.push(other);
				}
			}
		}
		frontier = next;
	}
	const instances = [...reached]
		.map((id) => byId.get(id) as OntologyInstance)
		.sort((a, b) => a.id.localeCompare(b.id));
	kept.sort(
		(a, b) =>
			a.from.localeCompare(b.from) ||
			a.relation.localeCompare(b.relation) ||
			a.to.localeCompare(b.to)
	);
	return { instances, edges: kept };
}

const renderInstance = (instance: OntologyInstance): string =>
	`${instance.class} ${instance.id} (${Object.entries(instance.attributes)
		.map(([key, value]) => `${key} ${String(value)}`)
		.join('; ')})`;

/**
 * The knowledge card (`70-…` §5): the root's neighbourhood to `depth`,
 * rendered one instance per line then one edge per line, in id order —
 * deterministic per seed, depth and purpose; cut to the budget at a line
 * boundary with a note when one is set.
 */
export function knowledgeCard(
	ont: Ontology,
	root: string,
	depth: number,
	purpose: string,
	options: CardOptions = {}
): string {
	const { instances, edges } = neighbourhood(ont, root, depth, purpose, {
		...options,
		specialCategory: false
	});
	if (instances.length === 0) return `Nothing about ${root} may be described for this purpose.`;
	const lines = [
		...instances.map(renderInstance),
		...edges.map((edge) => `${edge.from} —${edge.relation}→ ${edge.to}`)
	];
	const text = lines.join('\n');
	if (options.budgetTokens === undefined) return text;
	const limit = options.budgetTokens * 4;
	if (text.length <= limit) return text;
	const cut = text.slice(0, limit);
	const atLine = cut.lastIndexOf('\n');
	return `${atLine > 0 ? cut.slice(0, atLine) : cut}\n… [truncated to ${options.budgetTokens} tokens]`;
}

/** The instances one relation from `id` (optionally along one relation), under the purpose. */
export function neighbours(
	ont: Ontology,
	id: string,
	purpose: string,
	relation?: string,
	scope: OntologyScope = 'bank'
): Array<{ relation: string; instance: OntologyInstance }> {
	// Asking by the relation that reaches it, or from the record itself, is asking by name.
	const askedByName = relation !== undefined && ont.relations[relation]?.purposes !== undefined;
	const fromSensitive =
		ont.classes[[...ont.instances(scope)].find((i) => i.id === id)?.class ?? '']
			?.specialCategory === true;
	const { instances, edges } = neighbourhood(ont, id, 1, purpose, {
		scope,
		specialCategory: askedByName || fromSensitive,
		...(relation !== undefined ? { relations: [relation] } : {})
	});
	const byId = new Map(instances.map((instance) => [instance.id, instance]));
	const out: Array<{ relation: string; instance: OntologyInstance }> = [];
	for (const edge of edges) {
		const other = edge.from === id ? edge.to : edge.to === id ? edge.from : undefined;
		const instance = other === undefined ? undefined : byId.get(other);
		if (instance) out.push({ relation: edge.relation, instance });
	}
	return out;
}

/** The shortest chain of edges between two ids under the purpose, or none. */
export function pathBetween(
	ont: Ontology,
	from: string,
	to: string,
	purpose: string,
	scope: OntologyScope = 'bank'
): OntologyEdge[] | undefined {
	const { instances, edges } = neighbourhood(ont, from, 8, purpose, { scope });
	if (!instances.some((instance) => instance.id === to)) return undefined;
	const previous = new Map<string, OntologyEdge>();
	const seen = new Set([from]);
	let frontier = [from];
	while (frontier.length > 0 && !seen.has(to)) {
		const next: string[] = [];
		for (const id of frontier) {
			for (const edge of edges) {
				const other = edge.from === id ? edge.to : edge.to === id ? edge.from : undefined;
				if (other === undefined || seen.has(other)) continue;
				seen.add(other);
				previous.set(other, edge);
				next.push(other);
			}
		}
		frontier = next;
	}
	if (!seen.has(to)) return undefined;
	const chain: OntologyEdge[] = [];
	let at = to;
	while (at !== from) {
		const edge = previous.get(at);
		if (!edge) break;
		chain.unshift(edge);
		at = edge.from === at ? edge.to : edge.from;
	}
	return chain;
}

/** A class, described with its attributes and the relations it takes part in. */
export function describeClass(ont: Ontology, name: string): string | undefined {
	const cls = ont.classes[name];
	if (!cls) return undefined;
	const relations = Object.entries(ont.relations)
		.filter(([, relation]) => relation.from === name || relation.to === name)
		.map(([id, relation]) => `${relation.from} —${id}→ ${relation.to}`);
	return `${name}: ${cls.description} Attributes: ${cls.attributes.join(', ')}.${cls.specialCategory ? ' Special-category data.' : ''}${relations.length > 0 ? ` Relations: ${relations.join('; ')}.` : ''}`;
}
