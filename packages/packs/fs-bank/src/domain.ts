import type { DomainSpec } from '@craftabot/core';
import { CALIBRATION } from './calibration/index.js';
import { OBLIGATION_TAGS } from './obligations.js';
import { bankExtra } from './extra.js';
import { bankCase } from './generate/case.js';
import { bankOntology } from './ontology.js';
import { PERSONA_IDS } from './personas.js';

/**
 * **`uk-retail-banking`** (WP106 stage A, `83-TARGET-DESIGN-V6.md` §6.6.1;
 * decision D13, tenet 31): the bank's domain spec — what the domain pack
 * *is*, as data. The world pack and the journey packs; the obligation
 * vocabulary with its glosses; the decision rights every desk's ceilings
 * are drawn from, each with a source; the calibration table; the
 * ontology's classes and its special category; the coverage matrix — the
 * seven journeys shipped, and what is out and why; the personas; the
 * glossary. The journeys page draws the matrix from it; `checkDomainPack`
 * (WP107) holds the checklist against it. Every source is for Andrew's
 * reading, as the calibration rows are.
 */
const PRA_SS1_23 = {
	title: 'PRA SS1/23 — Model risk management principles for banks (2023)',
	url: 'https://www.bankofengland.co.uk/prudential-regulation/publication/2023/may/model-risk-management-principles-for-banks-ss',
	retrieved: '2026-09-12'
};
const FCA_CONC = {
	title: 'FCA Handbook CONC — Consumer Credit sourcebook',
	url: 'https://www.handbook.fca.org.uk/handbook/CONC/',
	retrieved: '2026-09-12'
};
const FCA_FG21_1 = {
	title: 'FCA FG21/1 — Guidance for firms on the fair treatment of vulnerable customers (2021)',
	url: 'https://www.fca.org.uk/publications/finalised-guidance/guidance-firms-fair-treatment-vulnerable-customers',
	retrieved: '2026-09-12'
};
const POCA = {
	title: 'Proceeds of Crime Act 2002, s.333A (tipping off)',
	url: 'https://www.legislation.gov.uk/ukpga/2002/29/section/333A',
	retrieved: '2026-09-12'
};
const MLR = {
	title:
		'The Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017',
	url: 'https://www.legislation.gov.uk/uksi/2017/692/contents',
	retrieved: '2026-09-12'
};
const PSR_APP = {
	title: 'PSR — Authorised push payment (APP) fraud reimbursement requirement (2024)',
	url: 'https://www.psr.org.uk/our-work/app-scams/',
	retrieved: '2026-09-12'
};
const UK_GDPR = {
	title: 'UK GDPR Article 5(1)(b)–(c) — purpose limitation and data minimisation',
	url: 'https://www.legislation.gov.uk/eur/2016/679/article/5',
	retrieved: '2026-09-12'
};
const DISP = {
	title: 'FCA Handbook DISP — Dispute resolution: complaints',
	url: 'https://www.handbook.fca.org.uk/handbook/DISP/',
	retrieved: '2026-09-12'
};

export const UK_RETAIL_BANKING_DOMAIN_ID = 'fs-bank/uk-retail-banking';

/** The ontology as the bank builds it over any case: the classes are the same whatever the seed. */
const ontology = bankOntology(bankExtra('reception', bankCase(1)));

export const ukRetailBankingDomain: DomainSpec = {
	schemaVersion: 1,
	id: UK_RETAIL_BANKING_DOMAIN_ID,
	name: 'UK retail banking (synthetic)',
	jurisdiction: 'United Kingdom',
	sector: 'retail banking',
	packs: {
		world: 'fs-bank',
		journeys: [
			'fs-advice',
			'fs-fraud',
			'fs-lending',
			'fs-onboarding',
			'fs-disputes',
			'fs-collections',
			'fs-servicing'
		]
	},
	obligations: { ...OBLIGATION_TAGS },
	decisionRights: [
		// The lending desk (`52-…`, `73-…`).
		{
			kind: 'in-policy-credit-approval',
			ceiling: 4,
			why: 'An in-policy approval is the assistant’s under four eyes at the payout.',
			source: FCA_CONC
		},
		{
			kind: 'adverse-credit-decision',
			ceiling: 3,
			why: 'An adverse decision has a right to human review.',
			source: FCA_CONC
		},
		{
			kind: 'vulnerable-customer-support',
			ceiling: 3,
			why: 'A support need is met on a person’s say.',
			source: FCA_FG21_1
		},
		{
			kind: 'sar-filing',
			ceiling: 2,
			why: 'A suspicious-activity report is a person’s; the machine drafts.',
			source: POCA
		},
		// The fraud desk (`51-…`, `76-…`).
		{
			kind: 'account-restriction',
			ceiling: 4,
			why: 'A freeze or a card block is reversible and the assistant’s under oversight.',
			source: PRA_SS1_23
		},
		{
			kind: 'customer-contact-on-fraud',
			ceiling: 4,
			why: 'Contact never names a suspicion (tipping off).',
			source: POCA
		},
		// The advice and complaints desks (`49-…`, `61-…`, `94-…`).
		{
			kind: 'regulated-advice',
			ceiling: 3,
			why: 'A personal recommendation is a person’s; the assistant prepares.',
			source: {
				title: 'FCA Handbook COBS 9 — Suitability',
				url: 'https://www.handbook.fca.org.uk/handbook/COBS/9/',
				retrieved: '2026-09-12'
			}
		},
		{
			kind: 'redress',
			ceiling: 3,
			why: 'Redress is offered on a person’s approval.',
			source: DISP
		},
		// The onboarding desk (`95-…`).
		{ kind: 'account-open', ceiling: 4, why: 'An account opens under four eyes.', source: MLR },
		{
			kind: 'adverse-onboarding-decision',
			ceiling: 3,
			why: 'A decline or a referral has a right to human review.',
			source: MLR
		},
		{
			kind: 'screening-hit-handling',
			ceiling: 3,
			why: 'A screening match is decided by a person; the assistant may run the screening.',
			source: POCA
		},
		// The disputes desk (`90-…`).
		{
			kind: 'reimbursement-within-limit',
			ceiling: 4,
			why: 'A reimbursement within the limit is the assistant’s under four eyes.',
			source: PSR_APP
		},
		{
			kind: 'reimbursement-above-limit',
			ceiling: 3,
			why: 'Above the limit is a person’s.',
			source: PSR_APP
		},
		{
			kind: 'dispute-decline',
			ceiling: 3,
			why: 'A decline has a right to human review.',
			source: PSR_APP
		},
		// The collections desk (`91-…`).
		{
			kind: 'forbearance',
			ceiling: 3,
			why: 'Forbearance is offered by a person or on a person’s say.',
			source: FCA_CONC
		},
		{
			kind: 'default-notice',
			ceiling: 2,
			why: 'A default notice is a person’s; the machine at most drafts.',
			source: FCA_CONC
		},
		{
			kind: 'plan-agreement',
			ceiling: 4,
			why: 'A plan is agreed under four eyes.',
			source: FCA_CONC
		},
		// The servicing desk (`92-…`).
		{
			kind: 'disclosure-recording',
			ceiling: 4,
			why: 'Recording a disclosure as said is the assistant’s to do.',
			source: FCA_FG21_1
		},
		{
			kind: 'closure',
			ceiling: 3,
			why: 'A closure is a person’s below four eyes.',
			source: UK_GDPR
		},
		{
			kind: 'third-party-access',
			ceiling: 3,
			why: 'Access to another’s account is a person’s, on an authority.',
			source: UK_GDPR
		}
	],
	calibration: CALIBRATION.id,
	ontology: {
		classes: Object.keys(ontology.classes),
		specialCategory: Object.entries(ontology.classes)
			.filter(([, cls]) => cls.specialCategory === true)
			.map(([name]) => name)
	},
	journeys: [
		{ workflowId: 'fs-advice/advice', name: 'Savings and investment advice', status: 'shipped' },
		{ workflowId: 'fs-fraud/fraud', name: 'Fraud operations', status: 'shipped' },
		{ workflowId: 'fs-lending/lending', name: 'Personal lending', status: 'shipped' },
		{ workflowId: 'fs-advice/complaints', name: 'Complaints', status: 'shipped' },
		{ workflowId: 'fs-onboarding/onboarding', name: 'Onboarding and KYC', status: 'shipped' },
		{ workflowId: 'fs-disputes/disputes', name: 'Payments and disputes', status: 'shipped' },
		{ workflowId: 'fs-collections/arrears', name: 'Collections and arrears', status: 'shipped' },
		{
			workflowId: 'fs-servicing/servicing',
			name: 'Account servicing and vulnerability support',
			status: 'shipped'
		},
		{
			workflowId: 'reception',
			name: 'Reception (the Front Desk)',
			status: 'supporting',
			why: 'The Workshop’s Front Desk world is the reception every desk hands from; it has no journey of its own.'
		},
		{
			workflowId: 'mortgages',
			name: 'Mortgages',
			status: 'out',
			why: 'MCOB’s affordability and advice rules are a domain of their own; the synthetic bank holds no property, valuation or conveyancing model.'
		},
		{
			workflowId: 'pensions',
			name: 'Pensions',
			status: 'out',
			why: 'Transfers and drawdown are advice under COBS 19 with a defined-benefit safeguard the bank does not model; the advice desk stops at savings and investments.'
		},
		{
			workflowId: 'insurance',
			name: 'Insurance',
			status: 'out',
			why: 'ICOBS claims and underwriting are a different product shape, with no policy or claim in the synthetic bank.'
		},
		{
			workflowId: 'business-banking',
			name: 'Business banking',
			status: 'out',
			why: 'The population is retail customers; a business, its officers and its beneficial owners are a world model the bank does not carry.'
		}
	],
	personas: [...PERSONA_IDS],
	glossary: {
		desk: 'One team’s work over the bank — a world the assistant sits at (the Kit says “playroom”).',
		journey:
			'A workflow: the stages a piece of work passes through, each with an executor (the Kit says “route”).',
		'work item':
			'One thing a journey works — an application, an alert, a complaint, a request — with its truth beside it.',
		truth:
			'What the case knows and the assistant must earn or never see; the evaluators read it, the prompt never does.',
		configuration:
			'Which stages the assistant runs, which a person, which a rule — one per autonomy level.',
		ceiling:
			'The highest autonomy level a kind of decision may run at, measured as a breach rate, never enforced.',
		'control map':
			'Rows of relevance: which obligation is evidenced by which card, evaluator or guarantee — a claim a compliance reader edits.',
		obligation:
			'A tag from the vocabulary, glossed: what the regulation or the guidance asks and the desk claims to be relevant to.',
		cohort:
			'Synthetic age and income bands with opaque proxies for protected characteristics — for the parity gates, never for a decision.',
		calibration: 'The table the population draws from, every row cited or stated as an assumption.'
	}
};
