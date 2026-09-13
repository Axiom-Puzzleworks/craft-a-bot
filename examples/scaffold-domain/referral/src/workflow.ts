import type {
	Executor,
	StageSpec,
	WorkflowConfig,
	WorkflowSpec,
	WorldState
} from '@craftabot/core';
import { referralBook } from './book.js';
import {
	REFERRAL_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	verdictFor,
	type ReferralDeskState
} from './desk.js';

/**
 * **The Referral journey** — four stages, `rules-only` and Level 4.
 * intake (rule) → review (agent) → decision (agent; the rule's verdict
 * suggested) → close (rule). At Level 4 the decision is confirmed by a
 * person before the close.
 */
export const REFERRAL_WORKFLOW_ID = 'referral/referral';
const desk = (state: WorldState): ReferralDeskState => state as ReferralDeskState;
const agent = (until: string, goalText: string): Executor => ({ kind: 'agent', until, goalText });
const rule = (id: string): Executor => ({ kind: 'rule', rule: id });

export const REFERRAL_CEILINGS = { 'referral-decision': 3, 'referral-agreement': 4 } as const;

export const referralStages: StageSpec[] = [
	{
		id: 'intake',
		name: 'Intake',
		input: { type: 'object', required: ['patient'], properties: { patient: { type: 'object' } } },
		output: { type: 'object', required: ['patient'], properties: { patient: { type: 'string' } } },
		executor: rule('intake-v1'),
		next: () => 'review'
	},
	{
		id: 'review',
		name: 'Review',
		obligations: ['veterinary-practice:record-keeping'],
		input: { type: 'object' },
		output: { type: 'object', required: ['reviewed'], properties: { reviewed: { const: true } } },
		executor: agent(
			'reviewed',
			'A case is on the desk. Review it: bring the figures onto the desk.'
		),
		read: (state) => (desk(state).extra.reviewed ? { reviewed: true } : undefined),
		next: () => 'decision'
	},
	{
		id: 'decision',
		name: 'Decision',
		obligations: ['veterinary-practice:fair-treatment'],
		input: { type: 'object' },
		output: {
			type: 'object',
			properties: {
				outcome: { enum: ['resolve', 'escalate'] },
				decision: { enum: ['resolve', 'escalate'] }
			}
		},
		executor: agent('decided', 'The figures are on the desk. Decide: resolve, or escalate.'),
		read: (state) => {
			const { decision } = desk(state).extra;
			return decision ? { outcome: decision } : undefined;
		},
		suggest: (_input, state) => verdictFor(desk(state).extra.patient),
		next: () => 'confirm'
	},
	{
		id: 'confirm',
		name: 'Four eyes',
		input: { type: 'object' },
		output: {
			type: 'object',
			required: ['decision'],
			properties: { decision: { enum: ['confirm', 'return'] } }
		},
		executor: {
			kind: 'human',
			prompt: 'Confirm the decision, or return the case.',
			options: ['confirm', 'return']
		},
		suggest: () => 'confirm',
		next: (out) => ((out as { decision?: string }).decision === 'confirm' ? 'close' : 'end')
	},
	{
		id: 'close',
		name: 'Close',
		input: { type: 'object' },
		output: {
			type: 'object',
			required: ['outcome'],
			properties: { outcome: { enum: ['resolve', 'escalate'] } }
		},
		executor: rule('close-v1'),
		next: () => 'end'
	}
];

export const REFERRAL_CONFIGURATIONS: Record<
	'rules-only' | 'bot-with-a-person-at-the-close',
	WorkflowConfig
> = {
	'rules-only': { executors: { review: rule('review-v1'), decision: rule('decision-v1') } },
	'bot-with-a-person-at-the-close': { autonomy: { level: 4, ceilings: { ...REFERRAL_CEILINGS } } }
};

export const referralWorkflow: WorkflowSpec = {
	id: REFERRAL_WORKFLOW_ID,
	name: 'The Referral journey',
	worldId: REFERRAL_DESK_WORLD_ID,
	purpose: 'Take a referral case from arrival to a decision confirmed by a person.',
	intake: (item) => ({ layoutId: WORK_ITEM_LAYOUT, input: item.payload, config: { item } }),
	stages: referralStages,
	first: 'intake',
	rules: {
		'intake-v1': (_input, state) => ({ output: { patient: desk(state).extra.patient.name.full } }),
		'review-v1': () => ({ output: { reviewed: true }, call: { name: 'review', arguments: {} } }),
		'decision-v1': (_input, state) => {
			const outcome = verdictFor(desk(state).extra.patient);
			return { output: { outcome }, call: { name: 'decide', arguments: { outcome } } };
		},
		'close-v1': (input, state) => {
			const chosen =
				(input as { outcome?: string }).outcome ?? desk(state).extra.decision ?? 'resolve';
			return { output: { outcome: chosen } };
		}
	},
	obligations: ['veterinary-practice:record-keeping', 'veterinary-practice:fair-treatment'],
	configurations: REFERRAL_CONFIGURATIONS,
	decisionKindOf: (stageId, output) => {
		if (stageId === 'decision' && (output as { outcome?: string } | undefined)?.outcome)
			return 'referral-decision';
		if (stageId === 'close') return 'referral-agreement';
		return undefined;
	},
	book: referralBook,
	kinds: ['referral' as never]
};
