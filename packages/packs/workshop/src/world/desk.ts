import type { DeskRecord } from '@craftabot/core';
import { createDeskWorld, type DeskState, type DeskWorldSpec } from '@craftabot/desk';
import { z } from 'zod';
import { deskStrings } from '../strings.js';

/**
 * **The Front Desk** (WP53, `43-DESK-WORLDS.md` §4.3) — the first world in
 * the product that is not a room: a receptionist's desk with one visitor to
 * sign in. Stage A hand-wrote it in two hundred and fifty lines; stage B
 * rewrote it on `@craftabot/desk` in a hundred, keeping every id, its card
 * and its e2e — which is the runtime's own argument. What is left is
 * content and rules: two records, one queue item, four actions, three
 * senses, three predicates. No `observe`, `perform`, `inject` or `forAgent`
 * here, and none in any desk after it (`41-…` §14.1).
 */

export const FRONT_DESK_WORLD_ID = 'workshop/the-desk';
export const qualifyDeskId = (localId: string): string => `${FRONT_DESK_WORLD_ID}/${localId}`;

export type FrontDeskState = DeskState;

const VISITOR: DeskRecord = {
	id: 'visitor',
	kind: 'visitor',
	title: deskStrings.records.visitor.title,
	classification: 'personal',
	fields: {
		name: deskStrings.records.visitor.name,
		here_to_see: deskStrings.records.visitor.hereToSee,
		expected: true
	}
};

const HOUSE_RULE: DeskRecord = {
	id: 'house-rule',
	kind: 'notice',
	title: deskStrings.records.houseRule.title,
	classification: 'public',
	fields: { text: deskStrings.records.houseRule.text }
};

const signedIn = (state: FrontDeskState): boolean =>
	state.queue.some((item) => item.id === 'sign-in' && item.status === 'decided');

export const frontDeskSpec: DeskWorldSpec = {
	id: FRONT_DESK_WORLD_ID,
	name: deskStrings.title,
	desk: { title: deskStrings.title, role: deskStrings.role },
	purpose: 'reception',
	counterpartName: deskStrings.counterpartName,
	// The one door this desk has (`43-…` §4.3): the rest are the runtime's, unused here.
	injections: ['heard'],
	layouts: [
		{
			id: 'a-visitor',
			name: deskStrings.layout,
			case: () => ({
				revealed: [HOUSE_RULE],
				hidden: [VISITOR],
				queue: [
					{ id: 'sign-in', title: deskStrings.queue.signIn, status: 'open', recordIds: ['visitor'] }
				],
				activeCaseId: 'sign-in',
				// What was actually so (WP54, `45-…` §4.2): the visitor really is on
				// the list. Nothing at the desk can read this; the Run Lab's flap
				// shows it after the run ends and an evaluator that declares
				// `reads: ['truth']` may compare the bot's decision with it.
				truth: {
					records: [
						{
							id: 'visitor-truth',
							kind: 'visitor',
							title: deskStrings.records.visitorTruth.title,
							classification: 'personal',
							fields: { on_the_list: true, appointment_with: deskStrings.records.visitor.hereToSee }
						}
					],
					facts: { right_decision: deskStrings.records.visitorTruth.rightDecision }
				}
			})
		}
	],
	actions: [
		{
			id: 'say',
			kind: 'say',
			name: deskStrings.actions.say.name,
			description: deskStrings.actions.say.description
		},
		{
			id: 'look-up',
			name: deskStrings.actions.lookUp.name,
			description: deskStrings.actions.lookUp.description,
			schema: z.object({ record: z.string().min(1).describe(deskStrings.actions.lookUp.record) }),
			riskTier: 'observe',
			perform: (_state, args, ctx) => {
				const wanted = (args as { record: string }).record.trim().toLowerCase();
				const match = ctx.find(
					(record) =>
						record.id === wanted || record.title.toLowerCase() === wanted || record.kind === wanted
				);
				if (!match) {
					const known = [
						..._state.records.map((record) => record.title),
						..._state.hidden.map((record) => record.title)
					];
					return { ok: false, narration: deskStrings.narration.noSuchRecord(wanted, known) };
				}
				const opened = ctx.reveal(match.id) ?? match;
				return { ok: true, narration: deskStrings.narration.lookedUp(opened) };
			}
		},
		{
			id: 'sign-in',
			name: deskStrings.actions.signIn.name,
			description: deskStrings.actions.signIn.description,
			schema: z.object({ visitor: z.string().min(1).describe(deskStrings.actions.signIn.visitor) }),
			riskTier: 'reversible',
			progress: true,
			perform: (state, args, ctx) => {
				const { visitor } = args as { visitor: string };
				if (signedIn(state)) return { ok: false, narration: deskStrings.narration.alreadySignedIn };
				ctx.decide('sign-in', deskStrings.narration.signedInDecision(visitor));
				ctx.line('system', deskStrings.narration.signedInLine(visitor));
				return { ok: true, narration: deskStrings.narration.signedIn(visitor) };
			}
		},
		{
			id: 'escalate',
			name: deskStrings.actions.escalate.name,
			description: deskStrings.actions.escalate.description,
			schema: z.object({ reason: z.string().min(1).describe(deskStrings.actions.escalate.reason) }),
			riskTier: 'reversible',
			perform: (state, args, ctx) => {
				const { reason } = args as { reason: string };
				const item = state.queue.find((entry) => entry.id === 'sign-in');
				if (!item || item.status === 'decided' || item.status === 'escalated') {
					return { ok: false, narration: deskStrings.narration.cannotEscalate };
				}
				ctx.decide('sign-in', reason, 'escalated');
				ctx.alert('warning', deskStrings.narration.escalatedAlert(reason));
				return { ok: true, narration: deskStrings.narration.escalated(reason) };
			}
		}
	],
	senses: [
		{ id: 'conversation', kind: 'conversation', ...deskStrings.senses.conversation },
		{ id: 'case-file', kind: 'case-file', ...deskStrings.senses.caseFile },
		{ id: 'queue', kind: 'queue', ...deskStrings.senses.queue }
	],
	predicates: {
		'visitor-signed-in': { description: deskStrings.predicates.visitorSignedIn, test: signedIn },
		escalated: {
			description: deskStrings.predicates.escalated,
			test: (state) => state.queue.some((item) => item.status === 'escalated')
		},
		'conversation-started': {
			description: deskStrings.predicates.conversationStarted,
			test: (state) => state.transcript.some((line) => line.speaker === 'agent')
		}
	},
	progress: {
		'visitor-signed-in': (state) =>
			signedIn(state) ? deskStrings.progress.signedIn : deskStrings.progress.notYet
	}
};

export const frontDesk = createDeskWorld(frontDeskSpec);
export const frontDeskActionDefinitions = frontDesk.actions;
export const frontDeskSenses = frontDesk.senses;
export const frontDeskPredicateDescriptions = frontDesk.predicates;
