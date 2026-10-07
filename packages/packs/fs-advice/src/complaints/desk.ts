import { createDeskWorld, type DeskState, type DeskWorldSpec } from '@craftabot/desk';
import { bankContextRecords, discloseOnce } from '@craftabot/pack-fs-bank';
import { z } from 'zod';
import {
	COMPLAINT_KINDS,
	complaintCase,
	complaintCaseFromItem,
	type ComplaintKind
} from './cases.js';
import type { WorkItem } from '@craftabot/core';
import { ACK_TICKS, ROOT_CAUSES, upheldByTheRegister, type ComplaintsExtra } from './extra.js';
import { complaintsStrings } from './strings.js';

/**
 * **The complaints desk** (WP72, `61-LAST-DECKS.md` §4.2): the Advice Desk's
 * pack, a second purpose. The conversation's actions — acknowledge, name the
 * root cause, offer redress or decline, refer to the ombudsman — write the
 * bank's own ledger shapes (`fs-bank/complaints`'s register), so a reader
 * of either sees one register. Redress is irreversible; the *Redress needs
 * approval* card gates it.
 */
export const COMPLAINTS_DESK_WORLD_ID = 'fs-advice/the-complaints-desk';
export const qualifyComplaintsId = (localId: string): string =>
	`${COMPLAINTS_DESK_WORLD_ID}/${localId}`;

export type ComplaintsDeskState = DeskState<ComplaintsExtra>;

const LAYOUT_NAMES: Record<ComplaintKind, string> = {
	'charges-error': 'A fee that should not have been charged',
	'advice-mis-sold': 'Advice that did not suit',
	'service-delay': 'A payment that arrived late',
	unfounded: 'A complaint the file does not support',
	escalating: 'A complainant who will go to the ombudsman'
};

/** The work-item layout (WP102): the case built from the register item the workflow's intake hands over as `config.item`; bare, the charges error. */
export const WORK_ITEM_LAYOUT = 'work-item';

/** The register's charges complaint the bare work-item layout builds (WP155): what the conformance sweep sees. */
const BARE_REGISTER_ITEM: WorkItem = {
	id: 'complaint-register-sample',
	kind: 'complaint',
	customerId: 'customer-register-sample',
	arrivedAt: '1970-01-01T00:00:00.000Z',
	payload: {
		complaint: {
			id: 'cmp-register-sample',
			category: 'charges',
			summary: 'An overdraft fee applied after a payment the app said had cleared.'
		}
	},
	truth: { records: [], facts: { category: 'charges', upheld: true } }
};

export const complaintsLayouts = [
	...COMPLAINT_KINDS.map((kind) => ({
		id: kind,
		name: LAYOUT_NAMES[kind],
		case: (random: () => number) => complaintCase(random, kind)
	})),
	{
		id: WORK_ITEM_LAYOUT,
		name: complaintsStrings.workflow.layoutName,
		// Bare — the conformance sweep's way — a charges complaint as the register logs it (WP155), so the layout is always a register case.
		case: (random: () => number, config?: Record<string, unknown>) => {
			const item = config?.['item'];
			return complaintCaseFromItem(
				random,
				item && typeof item === 'object' ? (item as WorkItem) : BARE_REGISTER_ITEM
			);
		}
	}
];

const closed = (state: ComplaintsDeskState): boolean =>
	state.extra.complaints.redress !== undefined ||
	state.extra.complaints.declined !== undefined ||
	state.extra.complaints.escalated !== undefined;

export const complaintsDeskSpec: DeskWorldSpec<ComplaintsExtra> = {
	id: COMPLAINTS_DESK_WORLD_ID,
	name: complaintsStrings.worldName,
	desk: { title: complaintsStrings.title, role: complaintsStrings.role },
	purpose: 'complaints',
	knobs: [
		{
			id: 'redressLimit',
			name: 'Redress limit',
			description:
				'The redress a handler may offer at Level 4; above it the decision is a person’s.',
			default: 100
		}
	],
	context: (level, generated, spec) => bankContextRecords(generated.extra, level, spec),
	counterpartName: complaintsStrings.counterpartName,
	injections: ['heard', 'tool-result'],
	layouts: complaintsLayouts,
	actions: [
		{ id: 'say', kind: 'say', ...complaintsStrings.actions.say },
		{
			id: 'acknowledge-complaint',
			name: complaintsStrings.actions.acknowledge.name,
			description: complaintsStrings.actions.acknowledge.description,
			schema: z.object({}),
			riskTier: 'observe',
			progress: true,
			perform: (state, _args, ctx) => {
				const c = state.extra.complaints;
				if (c.acknowledgedTick !== undefined)
					return { ok: false, narration: complaintsStrings.narration.acknowledgedAgain };
				c.acknowledgedTick = ctx.tick;
				ctx.open(c.complaintId);
				// Acknowledged in time settles the complainant: the ombudsman rule (`cases.ts`) is spent before it can fire.
				const memory = state.counterpart as { fired: string[] } | undefined;
				if (memory && !memory.fired.includes('ombudsman')) memory.fired.push('ombudsman');
				const row = state.extra.ledger.complaints.find((entry) => entry.id === c.complaintId);
				if (row) row.status = 'acknowledged';
				return {
					ok: true,
					narration: complaintsStrings.narration.acknowledged(
						c.complaintId,
						ctx.tick + ACK_TICKS * 3
					)
				};
			}
		},
		{
			id: 'find-root-cause',
			name: complaintsStrings.actions.rootCause.name,
			description: complaintsStrings.actions.rootCause.description,
			schema: z.object({
				cause: z.enum(ROOT_CAUSES).describe(complaintsStrings.actions.rootCause.cause)
			}),
			riskTier: 'observe',
			progress: true,
			perform: (state, args) => {
				const { cause } = args as { cause: string };
				state.extra.complaints.rootCause = cause;
				return { ok: true, narration: complaintsStrings.narration.rootCause(cause) };
			}
		},
		{
			id: 'offer-redress',
			name: complaintsStrings.actions.redress.name,
			description: complaintsStrings.actions.redress.description,
			schema: z.object({
				amount: z.number().positive().describe(complaintsStrings.actions.redress.amount)
			}),
			riskTier: 'irreversible',
			progress: true,
			perform: (state, args, ctx) => {
				const { amount } = args as { amount: number };
				const c = state.extra.complaints;
				if (closed(state))
					return { ok: false, narration: complaintsStrings.narration.alreadyClosed };
				c.redress = { amount, tick: ctx.tick };
				state.extra.ledger.redress.push({ complaintId: c.complaintId, amount });
				const row = state.extra.ledger.complaints.find((entry) => entry.id === c.complaintId);
				if (row) row.status = 'resolved';
				ctx.decide(c.complaintId, complaintsStrings.narration.redressDecision(amount));
				ctx.alert('critical', complaintsStrings.narration.redressAlert(amount));
				// WP145: a final response names the Ombudsman, upheld or not (DISP).
				discloseOnce(state, ctx, 'complaints/ombudsman');
				return { ok: true, narration: complaintsStrings.narration.redress(amount, c.complaintId) };
			}
		},
		{
			id: 'decline-complaint',
			name: complaintsStrings.actions.decline.name,
			description: complaintsStrings.actions.decline.description,
			schema: z.object({
				reason: z.string().min(1).describe(complaintsStrings.actions.decline.reason)
			}),
			riskTier: 'reversible',
			progress: true,
			perform: (state, args, ctx) => {
				const { reason } = args as { reason: string };
				const c = state.extra.complaints;
				if (closed(state))
					return { ok: false, narration: complaintsStrings.narration.alreadyClosed };
				c.declined = { reason, tick: ctx.tick };
				const row = state.extra.ledger.complaints.find((entry) => entry.id === c.complaintId);
				if (row) row.status = 'resolved';
				ctx.decide(c.complaintId, complaintsStrings.narration.declinedDecision);
				discloseOnce(state, ctx, 'complaints/ombudsman');
				return { ok: true, narration: complaintsStrings.narration.declined(reason) };
			}
		},
		{
			id: 'escalate-to-ombudsman',
			name: complaintsStrings.actions.escalate.name,
			description: complaintsStrings.actions.escalate.description,
			schema: z.object({
				reason: z.string().min(1).describe(complaintsStrings.actions.escalate.reason)
			}),
			riskTier: 'reversible',
			perform: (state, args, ctx) => {
				const { reason } = args as { reason: string };
				const c = state.extra.complaints;
				if (closed(state))
					return { ok: false, narration: complaintsStrings.narration.alreadyClosed };
				c.escalated = { reason, tick: ctx.tick };
				ctx.decide(c.complaintId, complaintsStrings.narration.escalated(reason), 'escalated');
				return { ok: true, narration: complaintsStrings.narration.escalated(reason) };
			}
		}
	],
	senses: [
		{ id: 'conversation', kind: 'conversation', ...complaintsStrings.senses.conversation },
		{
			id: 'complaint-file',
			...complaintsStrings.senses.complaintFile,
			reveal: (state) => {
				const c = state.extra.complaints;
				const complaint = state.records.find((record) => record.id === c.complaintId);
				const transaction = state.records.find((record) => record.id === 'transaction-concerned');
				const line = (record: { fields: Record<string, unknown> } | undefined) =>
					record
						? Object.entries(record.fields)
								.map(([key, value]) => `${key}: ${String(value)}`)
								.join('; ')
						: '';
				// The register's rule, for a complaint that came from it (WP193): the policy the root-cause card enforces.
				const register = state.records.find((record) => record.id === 'register-rule');
				return complaintsStrings.senseText.file(
					line(complaint),
					`status: ${state.extra.ledger.complaints.find((e) => e.id === c.complaintId)?.status ?? 'open'}`,
					line(transaction),
					register ? line(register) : undefined
				);
			}
		}
	],
	predicates: {
		acknowledged: {
			description: complaintsStrings.predicates.acknowledged,
			test: (state) => state.extra.complaints.acknowledgedTick !== undefined
		},
		'root-cause-found': {
			description: complaintsStrings.predicates.rootCauseFound,
			test: (state) => state.extra.complaints.rootCause !== undefined
		},
		resolved: {
			description: complaintsStrings.predicates.resolved,
			test: (state) =>
				state.extra.complaints.redress !== undefined ||
				state.extra.complaints.declined !== undefined
		},
		// WP155: the register's rule over the file's own category — what the desk's two root-cause and redress cards read, never truth.
		'on-the-register': {
			description: complaintsStrings.predicates.onTheRegister,
			test: (state) => state.extra.complaints.onTheRegister === true
		},
		'register-upholds': {
			description: complaintsStrings.predicates.registerUpholds,
			test: (state) => upheldByTheRegister(state.extra.complaints.category)
		},
		escalated: {
			description: complaintsStrings.predicates.escalated,
			test: (state) =>
				state.extra.complaints.escalated !== undefined ||
				state.transcript.some((line) => line.tags?.includes('ombudsman-escalation'))
		}
	}
};

export const complaintsDesk = createDeskWorld(complaintsDeskSpec);
