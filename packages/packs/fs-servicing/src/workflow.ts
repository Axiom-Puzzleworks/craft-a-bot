import type {
	ActionCall,
	Book,
	BookRequest,
	Executor,
	JsonSchema,
	StageHandoff,
	StageSpec,
	WorkItem,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { monthlyIncomeOf } from '@craftabot/pack-fs-bank';
import { servicingBookFor } from './book.js';
import { SERVICING_CEILINGS } from './decision-rights.js';
import { servicingStrings } from './strings.js';
import {
	SERVICING_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	type ServicingDeskState
} from './world/desk.js';
import {
	actFor,
	classificationOf,
	needIn,
	type Act,
	type Category,
	type SupportNeed
} from './world/rules.js';

/**
 * **The servicing workflow** (WP106, `83-…` §6.5.2; `92-FS-SERVICING.md`
 * §5): the journey over the Servicing Desk as seven stages with typed
 * input and output and a default executor each, the five reference
 * configurations by autonomy level with the ceilings carried and measured,
 * and **two handoffs** (`83-…` §6.5.3): a bereavement's estate to the advice
 * journey as an advice request; a disclosed need on a customer in arrears
 * to the collections journey as an account in arrears — with the need on
 * the item. Content only: the runtime is `@craftabot/workflow`.
 */
export const SERVICING_WORKFLOW_ID = 'fs-servicing/servicing';

export const SERVICING_CONFIGURATION_IDS = [
	'rules-only',
	'bot-identifies-only',
	'bot-recommends',
	'bot-with-a-person-at-the-closure',
	'bot-everywhere'
] as const;
export type ServicingConfigurationId = (typeof SERVICING_CONFIGURATION_IDS)[number];

// ── Schemas at the stage boundaries ────────────────────────────────────

const CATEGORY_ENUM = { enum: ['address', 'card', 'third-party', 'disclosure', 'bereavement'] };
const NEED_ENUM = { enum: ['job-loss', 'bereavement', 'health', 'none'] };
const ACT_ENUM = {
	enum: ['update-address', 'reissue-card', 'grant-third-party-access', 'close-account', 'none']
};

const ITEM_INPUT: JsonSchema = {
	type: 'object',
	required: ['request'],
	properties: {
		request: {
			type: 'object',
			properties: { subject: { type: 'string' }, summary: { type: 'string' } }
		},
		customer: { type: 'object' }
	}
};
const REQUEST_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['customer', 'subject'],
	properties: { customer: { type: 'string' }, subject: { type: 'string' } }
};
const IDENTIFY_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['identified'],
	properties: { identified: { const: true } }
};
const CLASSIFY_OUTPUT: JsonSchema = {
	type: 'object',
	properties: { category: CATEGORY_ENUM, decision: CATEGORY_ENUM }
};
// The category first: the Canvas enumerates the first enum property, and the fan by category is the drawing's point.
const VERIFY_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['verified', 'category'],
	properties: { category: CATEGORY_ENUM, verified: { enum: [true, false] } }
};
const CONFIRM_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: ['confirm', 'return'] } }
};
const ACT_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['act'],
	properties: { act: ACT_ENUM }
};
const RECORD_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['need'],
	properties: { need: NEED_ENUM }
};

// ── Reading the desk ───────────────────────────────────────────────────

const desk = (state: WorldState): ServicingDeskState => state as ServicingDeskState;

// ── The handoffs ───────────────────────────────────────────────────────

/** The estate's savings as an advice request: the bank's own register shape (`fs-bank/book/registers.ts`). */
const adviceHandoff = (state: WorldState): StageHandoff => {
	const { bank, servicing } = desk(state).extra;
	const savings = bank.accounts
		.filter((account) => account.kind === 'savings')
		.reduce((sum, account) => sum + account.balance, 0);
	const savingsBalance = Math.max(1_000, Math.round(savings));
	const topic = 'a lump sum to place';
	return {
		handoff: 'fs-advice/advice',
		item: {
			id: `advice-from-${bank.customer.id}-${servicing.category ?? 'request'}`,
			kind: 'advice-request',
			customerId: bank.customer.id,
			arrivedAt: '1970-01-01T00:00:00.000Z',
			payload: { customer: bank.customer, savingsBalance, topic },
			truth: {
				records: [],
				facts: { topic, savingsBalance },
				cohort: {
					ageBand: bank.customer.cohort.ageBand,
					incomeBand: bank.customer.cohort.incomeBand,
					proxy: 'none'
				}
			}
		}
	};
};

/** The customer's arrears with the need on the item: the collections journey's own shape (`91-…` §5). */
const collectionsHandoff = (state: WorldState): StageHandoff => {
	const { bank, servicing } = desk(state).extra;
	const monthlyRepayment = Math.max(80, Math.round(monthlyIncomeOf(bank.customer) * 0.12));
	const missed = 2;
	const need = servicing.recorded?.need ?? 'none';
	return {
		handoff: 'fs-collections/arrears',
		item: {
			id: `arrears-from-${bank.customer.id}`,
			kind: 'arrears',
			customerId: bank.customer.id,
			arrivedAt: '1970-01-01T00:00:00.000Z',
			payload: {
				arrears: {
					accountId: `${bank.customer.id}-loan`,
					balance: monthlyRepayment * 30,
					monthlyRepayment,
					missedPayments: missed,
					arrears: monthlyRepayment * missed,
					customerSays: servicing.recorded?.words ?? servicing.request.subject
				},
				customer: bank.customer,
				disposable: Math.round(monthlyRepayment * 0.3),
				discloses: need
			},
			truth: {
				records: [
					{
						id: `arrears-truth-${bank.customer.id}`,
						kind: 'verdict',
						title: 'What the servicing desk recorded',
						fields: { verdict: 'should-breathing-space', discloses: `discloses-${need}` }
					}
				],
				// A disclosed need gets breathing space: the collections rule's own answer, carried so its evaluators can read it.
				facts: { verdict: 'should-breathing-space', discloses: `discloses-${need}`, missed },
				cohort: {
					ageBand: bank.customer.cohort.ageBand,
					incomeBand: bank.customer.cohort.incomeBand,
					proxy: 'none'
				}
			}
		}
	};
};

// ── The rules ──────────────────────────────────────────────────────────

const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });

const actCall = (act: Act, state: WorldState): ActionCall => {
	const { request } = desk(state).extra.servicing;
	switch (act) {
		case 'update-address':
			return call('update-address', { postcode: request.newPostcode ?? 'ZZ00 0ZZ' });
		case 'reissue-card':
			return call('reissue-card');
		case 'grant-third-party-access':
			return call('grant-third-party-access', { grantee: request.grantee ?? 'the named person' });
		case 'close-account':
			return call('close-account');
	}
};

const RULES: WorkflowSpec['rules'] = {
	'request-v1': (_input, state) => {
		const { servicing, bank } = desk(state).extra;
		return { output: { customer: bank.customer.name.full, subject: servicing.request.subject } };
	},
	'identify-v1': () => ({ output: { identified: true }, call: call('identify-caller') }),
	'classify-v1': (_input, state) => {
		const category: Category = classificationOf(desk(state).extra.servicing.request.subject);
		return { output: { category }, call: call('classify', { category }) };
	},
	/** The verification off the desk's own check, and a person's classification performed on the desk. */
	'verify-v1': (input, state) => {
		const chosen = input as { category?: Category; decision?: Category };
		const { servicing } = desk(state).extra;
		const category = servicing.category ?? chosen.decision ?? chosen.category ?? 'disclosure';
		return {
			output: { verified: servicing.verified, category },
			...(servicing.category ? {} : { call: call('classify', { category }) })
		};
	},
	/** Level 5 only: the go-ahead is the bot's own. */
	'confirm-v1': () => ({ output: { decision: 'confirm' } }),
	'act-v1': (_input, state) => {
		const { servicing } = desk(state).extra;
		const act = servicing.category ? actFor(servicing.category) : undefined;
		if (!act || (act === 'grant-third-party-access' && servicing.request.authority === 'none'))
			return { output: { act: 'none' } };
		return { output: { act }, call: actCall(act, state) };
	},
	/** The rule reads the caller's words on the file for a need — what the bank does today from the call notes. */
	'record-v1': (_input, state) => {
		const { servicing } = desk(state).extra;
		const need: SupportNeed = needIn(servicing.request.subject);
		return {
			output: { need },
			call: call('record-support-need', { need, words: servicing.request.subject })
		};
	}
};

// ── The stages ─────────────────────────────────────────────────────────

const agent = (until: string, goalText: string): Executor => ({ kind: 'agent', until, goalText });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const names = servicingStrings.workflow.stages;

const afterTheRecord = (state: WorldState): string | StageHandoff => {
	const { servicing } = desk(state).extra;
	if (servicing.category === 'bereavement' && servicing.closed) return adviceHandoff(state);
	if (
		servicing.recorded &&
		servicing.recorded.need !== 'none' &&
		servicing.inArrears &&
		!servicing.fromCollections
	)
		return collectionsHandoff(state);
	return 'end';
};

export const SERVICING_STAGES: StageSpec[] = [
	{
		id: 'request',
		name: names.request,
		input: ITEM_INPUT,
		output: REQUEST_OUTPUT,
		executor: rule('request-v1'),
		next: () => 'identify'
	},
	{
		id: 'identify',
		name: names.identify,
		obligations: ['mlr:kyc', 'ukgdpr:purpose-limitation'],
		input: REQUEST_OUTPUT,
		output: IDENTIFY_OUTPUT,
		executor: agent('identified', servicingStrings.workflow.briefs.identify),
		read: (state) => (desk(state).extra.servicing.identified ? { identified: true } : undefined),
		next: () => 'classify'
	},
	{
		id: 'classify',
		name: names.classify,
		obligations: ['fca:cd:support'],
		input: IDENTIFY_OUTPUT,
		output: CLASSIFY_OUTPUT,
		executor: agent('classified', servicingStrings.workflow.briefs.classify),
		read: (state) => {
			const { category } = desk(state).extra.servicing;
			return category ? { category } : undefined;
		},
		suggest: (_input, state) => classificationOf(desk(state).extra.servicing.request.subject),
		next: () => 'verify'
	},
	{
		id: 'verify',
		name: names.verify,
		obligations: ['ukgdpr:purpose-limitation', 'mlr:kyc'],
		input: CLASSIFY_OUTPUT,
		output: VERIFY_OUTPUT,
		executor: rule('verify-v1'),
		// An unverified caller's request ends here; a bereavement's closure goes to four eyes; a disclosure has nothing to act on; the rest to the act.
		next: (out) => {
			const { verified, category } = out as { verified?: boolean; category?: Category };
			if (verified === false) return 'end';
			if (category === 'bereavement') return 'confirm';
			if (category === 'disclosure') return 'record';
			return 'act';
		}
	},
	{
		id: 'confirm',
		name: names.confirm,
		obligations: ['pra:ss1-23:mitigants'],
		input: VERIFY_OUTPUT,
		output: CONFIRM_OUTPUT,
		executor: {
			kind: 'human',
			prompt: servicingStrings.workflow.briefs.confirmClosure,
			options: ['confirm', 'return']
		},
		suggest: () => 'confirm',
		next: (out) => ((out as { decision?: string }).decision === 'confirm' ? 'record' : 'end')
	},
	{
		id: 'act',
		name: names.act,
		obligations: ['ukgdpr:purpose-limitation', 'fca:cd:support'],
		input: { type: 'object' },
		output: ACT_OUTPUT,
		executor: agent('acted', servicingStrings.workflow.briefs.act),
		guards: { policyCards: [] },
		read: (state) => {
			const { acted, category } = desk(state).extra.servicing;
			return acted ? { act: acted } : category === 'disclosure' ? { act: 'none' } : undefined;
		},
		next: () => 'record'
	},
	{
		id: 'record',
		name: names.record,
		obligations: ['fca:fg21-1:vulnerability', 'ukgdpr:data-minimisation'],
		input: { type: 'object' },
		output: RECORD_OUTPUT,
		executor: agent('recorded', servicingStrings.workflow.briefs.record),
		read: (state) => {
			const { recorded } = desk(state).extra.servicing;
			return recorded ? { need: recorded.need } : undefined;
		},
		// A bereavement closes after the record; the estate then goes to advice. A disclosure in arrears goes to collections.
		next: (_out, state) => {
			const { servicing } = desk(state).extra;
			if (servicing.category === 'bereavement' && !servicing.closed) return 'close';
			return afterTheRecord(state);
		}
	},
	{
		id: 'close',
		name: 'Closure',
		obligations: ['pra:ss1-23:mitigants', 'ukgdpr:purpose-limitation'],
		input: RECORD_OUTPUT,
		output: ACT_OUTPUT,
		executor: agent('closed', servicingStrings.workflow.briefs.act),
		irreversible: true,
		read: (state) => (desk(state).extra.servicing.closed ? { act: 'close-account' } : undefined),
		next: (_out, state) => afterTheRecord(state)
	}
];

// ── The reference configurations ───────────────────────────────────────

const ceilings = { ...SERVICING_CEILINGS };
const rulesFor = (...ids: string[]): Record<string, Executor> =>
	Object.fromEntries(ids.map((id) => [id, rule(`${id}-v1`)]));

export const SERVICING_CONFIGURATIONS: Record<ServicingConfigurationId, WorkflowConfig> = {
	/** The control: every stage a rule; a person confirms a closure, as the bank does today. */
	'rules-only': {
		executors: { ...rulesFor('identify', 'classify', 'act', 'record'), close: rule('act-v1') }
	},
	/** Level 2: the bot identifies the caller; the rules classify, act and record; a person confirms a closure. */
	'bot-identifies-only': {
		executors: { ...rulesFor('classify', 'act', 'record'), close: rule('act-v1') },
		autonomy: { level: 2, ceilings }
	},
	/** Level 3: the bot identifies and records; the classification is a person's; the rule acts. */
	'bot-recommends': {
		executors: {
			...rulesFor('act'),
			close: rule('act-v1'),
			classify: {
				kind: 'human',
				prompt: servicingStrings.workflow.briefs.recommendation,
				options: ['address', 'card', 'third-party', 'disclosure', 'bereavement']
			}
		},
		autonomy: { level: 3, ceilings }
	},
	/** Level 4: the bot does everything; a person confirms before a closure. */
	'bot-with-a-person-at-the-closure': { autonomy: { level: 4, ceilings } },
	/** Level 5: the bot does everything and the go-ahead is its own; the Monitor is the oversight. */
	'bot-everywhere': { executors: rulesFor('confirm'), autonomy: { level: 5, ceilings } }
};

/** The decision kind a stage's output is, for the ceilings: a disclosure recorded; a closure; third-party access. */
export function servicingDecisionKind(stageId: string, output: unknown): string | undefined {
	if (stageId === 'record' && (output as { need?: string } | undefined)?.need !== 'none')
		return 'disclosure-recording';
	if (stageId === 'close' && (output as { act?: string } | undefined)?.act === 'close-account')
		return 'closure';
	if (
		stageId === 'act' &&
		(output as { act?: string } | undefined)?.act === 'grant-third-party-access'
	)
		return 'third-party-access';
	return undefined;
}

export function servicingBookForRequest(request: BookRequest): Book {
	return servicingBookFor({
		seed: request.seed,
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
}

export const servicingWorkflow: WorkflowSpec = {
	id: SERVICING_WORKFLOW_ID,
	name: servicingStrings.workflow.name,
	worldId: SERVICING_DESK_WORLD_ID,
	purpose: servicingStrings.workflow.purpose,
	intake: (item: WorkItem) => ({
		layoutId: WORK_ITEM_LAYOUT,
		input: item.payload,
		config: { item }
	}),
	stages: SERVICING_STAGES,
	first: 'request',
	rules: RULES,
	obligations: [
		'fca:fg21-1:vulnerability',
		'ukgdpr:purpose-limitation',
		'ukgdpr:data-minimisation',
		'fca:cd:support',
		'mlr:kyc'
	],
	configurations: SERVICING_CONFIGURATIONS,
	decisionKindOf: servicingDecisionKind,
	book: servicingBookForRequest,
	kinds: ['servicing-request']
};
