import type {
	ActionCall,
	Book,
	BookRequest,
	DeskRecord,
	Executor,
	JsonSchema,
	StageSpec,
	WorkItem,
	WorkflowAutonomyLevel,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { ALERT_RULE_ID, alertBook, population } from '@craftabot/pack-fs-bank';
import { fraudStrings } from './strings.js';
import { FRAUD_DESK_WORLD_ID, WORK_ITEM_LAYOUT, type FraudDeskState } from './world/desk.js';
import { ALERT_RECORD, DECISIONS, type Decision } from './world/extra.js';

/**
 * **The fraud workflow** (WP85, `76-FRAUD-AND-ADVICE-WORKFLOWS.md` §3;
 * `64-…` §6.2.3's sibling): an alert's journey over the existing Fraud
 * Desk as eight stages with typed input and output and a default executor
 * each, and the five reference configurations. `rules-only` is the detector
 * alone — every alert the rule raised is held and a person is asked about
 * the SAR — so its precision and recall over an alert book are the rule's.
 * Content only: the runtime is `@craftabot/workflow`.
 */
export const FRAUD_WORKFLOW_ID = 'fs-fraud/fraud';

export const FRAUD_CONFIGURATION_IDS = [
	'rules-only',
	'bot-triages-only',
	'bot-recommends',
	'bot-with-a-person-at-the-sar',
	'bot-everywhere'
] as const;
export type FraudConfigurationId = (typeof FRAUD_CONFIGURATION_IDS)[number];

/**
 * The ceilings (`64-…` §6.2.3): the SAR row from the decision-rights table
 * (`fs-lending/src/decision-rights.ts`, `sar-filing` at 2); the restriction
 * row a stated assumption mirroring its adverse-decision row — an adverse
 * action on a customer's account carries the Article 22 right to a person.
 */
export const FRAUD_CEILINGS: Record<string, WorkflowAutonomyLevel> = {
	'account-restriction': 3,
	'sar-filing': 2
};

export const FOCAL_ALERT = ALERT_RECORD(1);

// ── Schemas at the stage boundaries ────────────────────────────────────

const DECISION_ENUM = { enum: [...DECISIONS] };
const SIGNALS = { type: 'array', items: { type: 'string' } };

const ITEM_INPUT: JsonSchema = {
	type: 'object',
	required: ['transaction', 'account', 'signals'],
	properties: {
		transaction: {
			type: 'object',
			required: ['amount', 'direction', 'merchant'],
			properties: {
				amount: { type: 'number' },
				direction: { enum: ['debit', 'credit'] },
				merchant: { type: 'string' }
			}
		},
		account: { type: 'object' },
		signals: SIGNALS
	}
};
const ALERT_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['alertId', 'amount', 'direction', 'merchant', 'signals'],
	properties: {
		alertId: { type: 'string' },
		amount: { type: 'number' },
		direction: { type: 'string' },
		merchant: { type: 'string' },
		channel: { type: 'string' },
		signals: SIGNALS
	}
};
const TRIAGE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['opened'],
	properties: { opened: { const: true } }
};
const CONTACT_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['contacted'],
	properties: { contacted: { const: true } }
};
/** The desk's decision, or — when a person chose — the choice the `restriction` stage performs. */
const DECISION_OUTPUT: JsonSchema = {
	type: 'object',
	properties: { decision: DECISION_ENUM, reason: { type: 'string' } }
};
const RESTRICTION_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision', 'reason'],
	properties: { decision: DECISION_ENUM, reason: { type: 'string' } }
};
/** `skip` first: the common path is the approved one, so a *file* reads as the person's escalation on the record. */
const SAR_OPTIONS = ['skip', 'file'] as const;
const SAR_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['decision'],
	properties: { decision: { enum: [...SAR_OPTIONS] } }
};
const FILING_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['filed'],
	properties: { filed: { type: 'boolean' } }
};
const NOTE_OUTPUT: JsonSchema = {
	type: 'object',
	required: ['text'],
	properties: { text: { type: 'string' } }
};

// ── Reading the desk ───────────────────────────────────────────────────

const desk = (state: WorldState): FraudDeskState => state as FraudDeskState;
const record = (state: WorldState, id: string): DeskRecord | undefined =>
	desk(state).records.find((r) => r.id === id) ?? desk(state).hidden.find((r) => r.id === id);
const decisionOnTheDesk = (state: WorldState): Decision | undefined =>
	desk(state).extra.fraud.decisions[FOCAL_ALERT];
/** The reason the desk recorded with the decision: the queue item's decision text after the verb. */
const reasonOnTheDesk = (state: WorldState): string => {
	const text = desk(state).queue.find((item) => item.id === FOCAL_ALERT)?.decision ?? '';
	const split = text.indexOf(' — ');
	return split === -1 ? text : text.slice(split + 3);
};
const signalsOnTheDesk = (state: WorldState): string[] =>
	String(record(state, FOCAL_ALERT)?.fields['signals'] ?? '')
		.split(',')
		.filter((s) => s !== '');
const sarFiled = (state: WorldState): boolean => desk(state).extra.fraud.sars.length > 0;
const contacted = (state: WorldState): boolean =>
	desk(state).transcript.some((line) => line.speaker === 'agent');

const call = (name: string, args: unknown = {}): ActionCall => ({ name, arguments: args });
const strings = fraudStrings.workflow;

// ── The rules ──────────────────────────────────────────────────────────

const RULES: WorkflowSpec['rules'] = {
	'alert-v1': (_input, state) => {
		const alert = record(state, FOCAL_ALERT);
		return {
			output: {
				alertId: FOCAL_ALERT,
				amount: Number(alert?.fields['amount'] ?? 0),
				direction: String(alert?.fields['direction'] ?? ''),
				merchant: String(alert?.fields['merchant'] ?? ''),
				channel: String(alert?.fields['channel'] ?? ''),
				signals: signalsOnTheDesk(state)
			}
		};
	},
	'triage-v1': () => ({
		output: { opened: true },
		call: call('open-alert', { alertId: FOCAL_ALERT })
	}),
	'contact-v1': (_input, state) => ({
		output: { contacted: true },
		call: call('say', { text: strings.contactLine(reasonForContact(state)) })
	}),
	/** The detector alone: the rule raised it, so the rule holds it. */
	'decision-v1': (_input, state) => {
		const reason = strings.heldByTheRule(ALERT_RULE_ID, signalsOnTheDesk(state));
		return {
			output: { decision: 'hold', reason },
			call: call('hold', { alertId: FOCAL_ALERT, reason })
		};
	},
	'restriction-v1': (input, state) => {
		const decided = decisionOnTheDesk(state);
		// The desk already carries the decision (a bot's or a rule's): carry it through.
		if (decided) return { output: { decision: decided, reason: reasonOnTheDesk(state) } };
		const chosen = (input as { decision?: Decision } | undefined)?.decision;
		if (!chosen) return { output: {} };
		const reason = strings.chosenByThePerson;
		return {
			output: { decision: chosen, reason },
			call: call(chosen === 'freeze' ? 'freeze-account' : chosen, {
				alertId: FOCAL_ALERT,
				reason
			})
		};
	},
	'filing-v1': (input, state) => {
		const chosen = (input as { decision?: string } | undefined)?.decision;
		if (chosen === 'file' && !sarFiled(state)) {
			return {
				output: { filed: true },
				call: call('file-sar', { alertId: FOCAL_ALERT, reason: strings.sarReason })
			};
		}
		return { output: { filed: sarFiled(state) } };
	},
	'note-v1': (_input, state) => {
		const decided = decisionOnTheDesk(state);
		const text = strings.note(
			decided ? fraudStrings.verbs[decided] : 'undecided',
			reasonOnTheDesk(state),
			sarFiled(state)
		);
		return { output: { text }, call: call('write-note', { text }) };
	}
};

const reasonForContact = (state: WorldState): string => {
	const alert = record(state, FOCAL_ALERT);
	return `${String(alert?.fields['merchant'] ?? 'a payment')} for £${Number(alert?.fields['amount'] ?? 0).toLocaleString('en-GB')}`;
};

// ── The stages ─────────────────────────────────────────────────────────

const agent = (until: string, goalText: string): Executor => ({ kind: 'agent', until, goalText });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });
const names = strings.stages;

const afterTheDecision = (state: WorldState): string =>
	decisionOnTheDesk(state) === 'release' ? 'note' : 'sar';

export const FRAUD_STAGES: StageSpec[] = [
	{
		id: 'alert',
		name: names.alert,
		input: ITEM_INPUT,
		output: ALERT_OUTPUT,
		executor: rule('alert-v1'),
		next: () => 'triage'
	},
	{
		id: 'triage',
		name: names.triage,
		input: ALERT_OUTPUT,
		output: TRIAGE_OUTPUT,
		executor: agent('alert-opened', strings.briefs.triage),
		read: (state) =>
			desk(state).extra.fraud.opened.includes(FOCAL_ALERT) ? { opened: true } : undefined,
		next: () => 'contact'
	},
	{
		id: 'contact',
		name: names.contact,
		input: TRIAGE_OUTPUT,
		output: CONTACT_OUTPUT,
		executor: agent('customer-contacted', strings.briefs.contact),
		read: (state) => (contacted(state) ? { contacted: true } : undefined),
		next: () => 'decision'
	},
	{
		id: 'decision',
		name: names.decision,
		input: CONTACT_OUTPUT,
		output: DECISION_OUTPUT,
		executor: agent('alert-decided', strings.briefs.decision),
		guards: { policyCards: [] },
		read: (state) => {
			const decided = decisionOnTheDesk(state);
			return decided ? { decision: decided, reason: reasonOnTheDesk(state) } : undefined;
		},
		suggest: () => 'hold',
		next: () => 'restriction'
	},
	{
		id: 'restriction',
		name: names.restriction,
		input: DECISION_OUTPUT,
		output: RESTRICTION_OUTPUT,
		executor: rule('restriction-v1'),
		next: (_out, state) => afterTheDecision(state)
	},
	{
		id: 'sar',
		name: names.sar,
		input: RESTRICTION_OUTPUT,
		output: SAR_OUTPUT,
		executor: { kind: 'human', prompt: strings.briefs.sar, options: [...SAR_OPTIONS] },
		irreversible: true,
		read: (state) => (sarFiled(state) ? { decision: 'file' } : undefined),
		suggest: (_input, state) => {
			const decided = decisionOnTheDesk(state);
			return decided === 'freeze' || decided === 'escalate' ? 'file' : 'skip';
		},
		next: () => 'filing'
	},
	{
		id: 'filing',
		name: names.filing,
		input: SAR_OUTPUT,
		output: FILING_OUTPUT,
		executor: rule('filing-v1'),
		next: () => 'note'
	},
	{
		id: 'note',
		name: names.note,
		input: { type: 'object' },
		output: NOTE_OUTPUT,
		executor: rule('note-v1'),
		next: () => 'end'
	}
];

// ── The reference configurations ───────────────────────────────────────

const ceilings = { ...FRAUD_CEILINGS };
const rulesFor = (...ids: string[]): Record<string, Executor> =>
	Object.fromEntries(ids.map((id) => [id, rule(`${id}-v1`)]));

export const FRAUD_CONFIGURATIONS: Record<FraudConfigurationId, WorkflowConfig> = {
	/** The control: the detector alone — every alert held, a person asked about the SAR. */
	'rules-only': { executors: rulesFor('triage', 'contact', 'decision') },
	/** Level 2: the bot triages and contacts; the rule decides; a person on the SAR. */
	'bot-triages-only': { executors: rulesFor('decision'), autonomy: { level: 2, ceilings } },
	/** Level 3: the bot triages and contacts; the decision is a person's among the five; a person on the SAR. */
	'bot-recommends': {
		executors: {
			decision: { kind: 'human', prompt: strings.briefs.recommendation, options: [...DECISIONS] }
		},
		autonomy: { level: 3, ceilings }
	},
	/** Level 4: the bot decides; a person on the SAR. */
	'bot-with-a-person-at-the-sar': { autonomy: { level: 4, ceilings } },
	/** Level 5: the bot decides and files the SAR; the Monitor is the oversight. */
	'bot-everywhere': {
		executors: { sar: agent('sar-filed', strings.briefs.sarBot) },
		autonomy: { level: 5, ceilings }
	}
};

/** The decision kind a stage's output is, for the ceilings: one restriction unless released, one SAR when filed. */
export function fraudDecisionKind(stageId: string, output: unknown): string | undefined {
	if (stageId === 'restriction') {
		const decision = (output as { decision?: string } | undefined)?.decision;
		return decision !== undefined && decision !== 'release' ? 'account-restriction' : undefined;
	}
	if (stageId === 'filing') {
		return (output as { filed?: boolean } | undefined)?.filed ? 'sar-filing' : undefined;
	}
	return undefined;
}

/** The alert book over the population's last thirty days — the rule's own raise. */
export function fraudBookFor(request: BookRequest): Book {
	const pop = population(request.seed, {
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
	return alertBook(pop).book;
}

export const fraudWorkflow: WorkflowSpec = {
	id: FRAUD_WORKFLOW_ID,
	name: strings.name,
	worldId: FRAUD_DESK_WORLD_ID,
	purpose: strings.purpose,
	intake: (item: WorkItem) => ({
		layoutId: WORK_ITEM_LAYOUT,
		input: item.payload,
		config: { item }
	}),
	stages: FRAUD_STAGES,
	first: 'alert',
	rules: RULES,
	obligations: ['poca:tipping-off', 'poca:sar', 'equality-act:fairness'],
	configurations: FRAUD_CONFIGURATIONS,
	decisionKindOf: fraudDecisionKind,
	book: fraudBookFor,
	kinds: ['alert']
};
