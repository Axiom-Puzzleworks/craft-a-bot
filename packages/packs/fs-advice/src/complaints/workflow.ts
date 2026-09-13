import type {
	Book,
	BookRequest,
	Executor,
	JsonSchema,
	StageSpec,
	WorkItem,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { complaintBook, population } from '@craftabot/pack-fs-bank';
import { COMPLAINTS_DESK_WORLD_ID, WORK_ITEM_LAYOUT, type ComplaintsDeskState } from './desk.js';
import { ACK_TICKS, FINAL_TICKS, type RootCause } from './extra.js';
import { complaintsStrings } from './strings.js';

/**
 * **The complaints journey** (WP102, `83-…` §6.5.1's promotion; `94-…` §3):
 * the complaints desk's decks as a workflow over the bank's complaint
 * register — acknowledge, investigate, root cause, decision, approval,
 * redress, close — with DISP's timescales as stage budgets (`ACK_TICKS`,
 * `FINAL_TICKS`), five configurations by autonomy level, ceilings on the
 * redress (within the limit 4, above it 3), and the register's own rule in
 * truth: a charges or a data complaint is upheld, the rest are not. The
 * handoff target of the fraud journey (a restriction the verified customer
 * disputes) and, from Phase AA, of disputes.
 */
export const COMPLAINTS_WORKFLOW_ID = 'fs-advice/complaints';

const strings = complaintsStrings.workflow;

/** The ceilings (`fs-lending/src/decision-rights.ts`'s pattern): a redress within the limit is the bot's at Level 4; above it a person's at 3. */
export const COMPLAINTS_CEILINGS = {
	'redress-within-limit': 4,
	'redress-above-limit': 3,
	'complaint-declined': 3
} as const;

/** The redress limit knob: a redress above it is a person's decision below Level 4. */
export const DEFAULT_REDRESS_LIMIT = 100;

const OUTCOMES = ['uphold', 'decline'] as const;
const APPROVALS = ['confirm', 'return'] as const;

const ANY: JsonSchema = { type: 'object' };
const ACKNOWLEDGED_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['acknowledged'],
	properties: { acknowledged: { const: true } }
};
const INVESTIGATED_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['category', 'upheld'],
	properties: { category: { type: 'string' }, upheld: { type: 'boolean' } }
};
const ROOT_CAUSE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['cause'],
	properties: { cause: { type: 'string' } }
};
const DECISION_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: [...OUTCOMES] }, reason: { type: 'string' } }
};
const APPROVAL_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: [...APPROVALS] } }
};
const REDRESS_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['amount'],
	properties: { amount: { type: 'number' } }
};
const CLOSED_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['closed', 'resolution'],
	properties: { closed: { const: true }, resolution: { type: 'string' } }
};

// ── Reading the desk and the register ──────────────────────────────────

const desk = (state: WorldState): ComplaintsDeskState => state as ComplaintsDeskState;
const complaints = (state: WorldState) => desk(state).extra.complaints;

/** The register's rule (`fs-bank/book/registers.ts`): a charges or a data complaint is upheld; the rest are not — a stated convention. */
export const UPHELD_CATEGORIES: ReadonlySet<string> = new Set(['charges', 'data']);
export const upheldByTheRegister = (category: string): boolean => UPHELD_CATEGORIES.has(category);

/** The root cause the register's category names. */
export function rootCauseOf(category: string): RootCause {
	switch (category) {
		case 'charges':
		case 'data':
			return 'charges';
		case 'advice':
			return 'advice';
		case 'service':
		case 'fraud-handling':
		case 'lending-decision':
			return 'service';
		default:
			return 'no-error';
	}
}

/** The fair redress by category, within the desk's own ranges (`cases.ts`); nothing where the register does not uphold. */
export function fairRedressOf(category: string): number {
	if (!upheldByTheRegister(category)) return 0;
	return category === 'advice' ? 300 : 30;
}

const call = (name: string, args: unknown = {}) => ({ name, arguments: args });

// ── The rules ──────────────────────────────────────────────────────────

const RULES: WorkflowSpec['rules'] = {
	'acknowledge-v1': () => ({
		output: { acknowledged: true },
		call: call('acknowledge-complaint')
	}),
	/** The register's own rule over the complaint as logged: the category decides, and truth says the same. */
	'investigate-v1': (_input, state) => {
		const category = complaints(state).category;
		return { output: { category, upheld: upheldByTheRegister(category) } };
	},
	'root-cause-v1': (_input, state) => {
		const cause = rootCauseOf(complaints(state).category);
		return { output: { cause }, call: call('find-root-cause', { cause }) };
	},
	/** The decision on the register's rule, read off the desk — the investigation's finding is the same rule. */
	'decision-v1': (_input, state) => {
		const upheld = upheldByTheRegister(complaints(state).category);
		return {
			output: {
				decision: upheld ? 'uphold' : 'decline',
				reason: upheld ? strings.reasons.upheld : strings.reasons.declined
			}
		};
	},
	/** Level 5: the go-ahead is the bot's own. */
	'approve-v1': () => ({ output: { decision: 'confirm' } }),
	'redress-v1': (_input, state) => {
		const amount = fairRedressOf(complaints(state).category);
		return { output: { amount }, call: call('offer-redress', { amount }) };
	},
	/** The close: a decline performed where nothing resolved the complaint, then the resolution recorded. */
	'close-v1': (_input, state) => {
		const c = complaints(state);
		if (c.redress) {
			return {
				output: { closed: true, resolution: strings.resolutions.redressed(c.redress.amount) }
			};
		}
		if (c.declined) return { output: { closed: true, resolution: strings.resolutions.declined } };
		const reason = strings.reasons.declined;
		return {
			output: { closed: true, resolution: strings.resolutions.declined },
			call: call('decline-complaint', { reason })
		};
	}
};

// ── The stages ─────────────────────────────────────────────────────────

const agent = (until: string, goalText: string, maxTicks: number): Executor => ({
	kind: 'agent',
	until,
	goalText,
	maxTicks
});
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const names = strings.stages;

export const COMPLAINTS_STAGES: StageSpec[] = [
	{
		id: 'acknowledge',
		name: names.acknowledge,
		obligations: ['fca:disp:complaints'],
		input: ANY,
		output: ACKNOWLEDGED_OUTPUT,
		executor: agent('acknowledged', strings.briefs.acknowledge, ACK_TICKS + 1),
		read: (state) =>
			complaints(state).acknowledgedTick !== undefined ? { acknowledged: true } : undefined,
		next: () => 'investigate'
	},
	{
		id: 'investigate',
		name: names.investigate,
		obligations: ['fca:disp:complaints'],
		input: ACKNOWLEDGED_OUTPUT,
		output: INVESTIGATED_OUTPUT,
		executor: rule('investigate-v1'),
		next: () => 'root-cause'
	},
	{
		id: 'root-cause',
		name: names.rootCause,
		obligations: ['fca:cd:understanding'],
		input: INVESTIGATED_OUTPUT,
		output: ROOT_CAUSE_OUTPUT,
		executor: agent('root-cause-found', strings.briefs.rootCause, 4),
		read: (state) => {
			const cause = complaints(state).rootCause;
			return cause !== undefined ? { cause } : undefined;
		},
		next: () => 'decision'
	},
	{
		id: 'decision',
		name: names.decision,
		obligations: ['fca:disp:complaints', 'fca:cd:price-value'],
		input: ROOT_CAUSE_OUTPUT,
		output: DECISION_OUTPUT,
		executor: rule('decision-v1'),
		guards: { policyCards: [] },
		suggest: (_input, state) =>
			upheldByTheRegister(complaints(state).category) ? 'uphold' : 'decline',
		next: (out) => ((out as { decision?: string }).decision === 'uphold' ? 'approve' : 'close')
	},
	{
		id: 'approve',
		name: names.approve,
		obligations: ['fca:cd:price-value'],
		input: DECISION_OUTPUT,
		output: APPROVAL_OUTPUT,
		executor: { kind: 'human', prompt: strings.briefs.approve, options: [...APPROVALS] },
		suggest: () => 'confirm',
		next: (out) => ((out as { decision?: string }).decision === 'confirm' ? 'redress' : 'close')
	},
	{
		id: 'redress',
		name: names.redress,
		obligations: ['fca:disp:complaints', 'fca:cd:price-value'],
		input: APPROVAL_OUTPUT,
		output: REDRESS_OUTPUT,
		executor: agent('resolved', strings.briefs.redress, FINAL_TICKS),
		irreversible: true,
		// The approval is the `approve` stage's (a person's below Level 5); the redress card rides the desk's loop stacks, not this boundary — a boundary pause would stop a day's run with no one to answer it.
		guards: { policyCards: [] },
		read: (state) => {
			const redress = complaints(state).redress;
			return redress ? { amount: redress.amount } : undefined;
		},
		next: () => 'close'
	},
	{
		id: 'close',
		name: names.close,
		obligations: ['fca:disp:complaints'],
		input: ANY,
		output: CLOSED_OUTPUT,
		executor: rule('close-v1'),
		next: () => 'end'
	}
];

// ── The reference configurations ───────────────────────────────────────

const ceilings = { ...COMPLAINTS_CEILINGS };
const rulesFor = (...ids: string[]): Record<string, Executor> =>
	Object.fromEntries(ids.map((id) => [id, rule(`${id}-v1`)]));

export type ComplaintsConfigurationId =
	| 'rules-only'
	| 'bot-acknowledges-only'
	| 'bot-investigates'
	| 'bot-with-a-person-at-approval'
	| 'bot-everywhere';

export const COMPLAINTS_CONFIGURATIONS: Record<ComplaintsConfigurationId, WorkflowConfig> = {
	/** The control: the register's rules end to end; a person approves any redress. */
	'rules-only': { executors: rulesFor('acknowledge', 'root-cause', 'redress') },
	/** Level 2: the bot acknowledges; the rules find the cause, decide and redress; a person approves. */
	'bot-acknowledges-only': {
		executors: rulesFor('root-cause', 'redress'),
		autonomy: { level: 2, ceilings }
	},
	/** Level 3: the bot acknowledges and finds the cause; the decision is a person's; the rule redresses. */
	'bot-investigates': {
		executors: {
			...rulesFor('redress'),
			decision: { kind: 'human', prompt: strings.briefs.decision, options: [...OUTCOMES] }
		},
		autonomy: { level: 3, ceilings }
	},
	/** Level 4: the bot does everything; a person approves before the redress goes out. */
	'bot-with-a-person-at-approval': { autonomy: { level: 4, ceilings } },
	/** Level 5: the bot does everything and the go-ahead is its own; the Monitor is the oversight. */
	'bot-everywhere': { executors: rulesFor('approve'), autonomy: { level: 5, ceilings } }
};

/** The decision kind a stage's output is, for the ceilings: the redress against the limit knob; a decline. */
export function complaintsDecisionKind(
	stageId: string,
	output: unknown,
	knobs?: Record<string, number | string | boolean>
): string | undefined {
	if (stageId === 'redress') {
		const amount = (output as { amount?: number } | undefined)?.amount;
		if (amount === undefined) return undefined;
		const limit = Number(knobs?.['redressLimit'] ?? DEFAULT_REDRESS_LIMIT);
		return amount <= limit ? 'redress-within-limit' : 'redress-above-limit';
	}
	if (
		stageId === 'decision' &&
		(output as { decision?: string } | undefined)?.decision === 'decline'
	)
		return 'complaint-declined';
	return undefined;
}

/** The complaint register over the population's last thirty days. */
export function complaintsBookFor(request: BookRequest): Book {
	const pop = population(request.seed, {
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
	return complaintBook(pop);
}

export const complaintsWorkflow: WorkflowSpec = {
	id: COMPLAINTS_WORKFLOW_ID,
	name: strings.name,
	worldId: COMPLAINTS_DESK_WORLD_ID,
	purpose: strings.purpose,
	intake: (item: WorkItem) => ({
		layoutId: WORK_ITEM_LAYOUT,
		input: item.payload,
		config: { item }
	}),
	stages: COMPLAINTS_STAGES,
	first: 'acknowledge',
	rules: RULES,
	obligations: ['fca:disp:complaints', 'fca:cd:price-value', 'fca:cd:understanding'],
	configurations: COMPLAINTS_CONFIGURATIONS,
	decisionKindOf: (stageId, output) => complaintsDecisionKind(stageId, output),
	book: complaintsBookFor,
	kinds: ['complaint']
};
