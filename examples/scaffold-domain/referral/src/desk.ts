import { createDeskWorld, seedFrom, type DeskState, type DeskWorldSpec } from '@craftabot/desk';
import type { WorkItem } from '@craftabot/core';
import { patientFrom, type Patient } from '../../vet-practice/src/index.js';
import { z } from 'zod';

/**
 * **The Referral desk** — scaffolded (`93-DOMAIN-PACK.md` §4): a
 * patient with a case on the desk, three actions (say, review, decide)
 * with a tier each, two predicates, one layout and the work-item layout a
 * journey's intake fills. The rule in truth: a case with a figure above the
 * threshold is *escalated*, the rest *resolved*.
 */
export const REFERRAL_DESK_WORLD_ID = 'referral/the-referral-desk';
export const THRESHOLD = 500;

export interface ReferralExtra {
	patient: Patient;
	reviewed: boolean;
	decision?: 'resolve' | 'escalate';
}
export type ReferralDeskState = DeskState<ReferralExtra>;

export const verdictFor = (patient: Patient): 'resolve' | 'escalate' =>
	patient.figure > THRESHOLD ? 'escalate' : 'resolve';

export function referralCase(random: () => number, given?: Patient) {
	const patient = given ?? patientFrom(seedFrom(random));
	const verdict = verdictFor(patient);
	return {
		revealed: [
			{
				id: 'desk-brief',
				kind: 'notice',
				title: 'Desk brief',
				classification: 'public' as const,
				fields: { text: 'Review the case, then decide: resolve it, or escalate it to a person.' }
			},
			{
				id: 'case',
				kind: 'case',
				title: 'The case',
				classification: 'personal' as const,
				fields: { patient: patient.name.full, band: patient.band }
			}
		],
		hidden: [
			{
				id: 'figures',
				kind: 'figures',
				title: 'The figures',
				classification: 'personal' as const,
				fields: { figure: patient.figure, threshold: THRESHOLD }
			}
		],
		queue: [
			{
				id: 'case',
				title: `Case for ${patient.name.full}`,
				status: 'open' as const,
				recordIds: ['case']
			}
		],
		activeCaseId: 'case',
		extra: { patient, reviewed: false },
		truth: { records: [], facts: { verdict: `should-${verdict}` } }
	};
}

export const WORK_ITEM_LAYOUT = 'work-item';

export const referralDeskSpec: DeskWorldSpec<ReferralExtra> = {
	id: REFERRAL_DESK_WORLD_ID,
	name: 'Referral desk (scaffolded)',
	desk: { title: 'The Referral desk', role: 'Referral assistant' },
	purpose: 'referral',
	counterpartName: 'Patient',
	injections: ['heard'],
	layouts: [
		{ id: 'a-case', name: 'A case', case: (random) => referralCase(random) },
		{
			id: WORK_ITEM_LAYOUT,
			name: 'A case from the book',
			case: (random, config) => {
				const item = config?.['item'] as WorkItem | undefined;
				const payload = item?.payload as { patient?: Patient } | undefined;
				return referralCase(random, payload?.patient);
			}
		}
	],
	actions: [
		{ id: 'say', kind: 'say', name: 'Say', description: 'Say something to the patient.' },
		{
			id: 'review',
			name: 'Review the case',
			description: 'Bring the figures onto the desk. Observe.',
			schema: z.object({}),
			riskTier: 'observe',
			perform: (state, _args, ctx) => {
				ctx.open('case');
				ctx.reveal('figures');
				state.extra.reviewed = true;
				return { ok: true, narration: 'The figures are on the desk.' };
			}
		},
		{
			id: 'decide',
			name: 'Decide',
			description: 'Resolve the case, or escalate it to a person. Reversible.',
			schema: z.object({ outcome: z.enum(['resolve', 'escalate']) }),
			riskTier: 'reversible',
			perform: (state, args, ctx) => {
				const { outcome } = args as { outcome: 'resolve' | 'escalate' };
				state.extra.decision = outcome;
				ctx.decide('case', outcome, outcome === 'escalate' ? 'escalated' : 'decided');
				return { ok: true, narration: `Decided: ${outcome}.` };
			}
		}
	],
	senses: [
		{
			id: 'case',
			name: 'Case',
			description: 'The case and, once reviewed, its figures.',
			reveal: (state) =>
				state.records
					.filter((record) => record.id === 'case' || record.id === 'figures')
					.map((record) =>
						Object.entries(record.fields)
							.map(([key, value]) => `${key} ${String(value)}`)
							.join(', ')
					)
					.join('; ')
		},
		{
			id: 'conversation',
			kind: 'conversation',
			name: 'Conversation',
			description: 'What the patient has said.'
		}
	],
	predicates: {
		reviewed: {
			description: 'The figures are on the desk.',
			test: (state) => state.extra.reviewed
		},
		decided: {
			description: 'The case is decided.',
			test: (state) => state.extra.decision !== undefined
		}
	}
};

export const referralDesk = createDeskWorld(referralDeskSpec);
