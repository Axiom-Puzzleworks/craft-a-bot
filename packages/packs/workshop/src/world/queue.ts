import type { DeskRecord } from '@craftabot/core';
import {
	createDeskWorld,
	type DeskActionContext,
	type DeskState,
	type DeskTruth,
	type DeskWorldSpec
} from '@craftabot/desk';
import { z } from 'zod';
import { deskStrings, queueStrings } from '../strings.js';

/**
 * **The Front Desk: the queue** (WP131, `109-THE-TAIL-DAY7.md` §3; `100-…`
 * §6.8, G89) — the Kit's one Day 7 card, *Sure or unsure*. Six visitors wait,
 * each with a note. A reader reads a note and answers *on the list* or *not*,
 * with how sure it is (the one confidence formula, `104-READERS.md` §3). The
 * child sets a line on the card's dial: when the bot acts, a reading below
 * the line goes to a colleague instead, and the colleague can take three.
 * Set the line too low and a confidently wrong reading lets the wrong person
 * in; too high and the colleague is swamped. Between the two, the queue is
 * handled well.
 *
 * Its own world beside the Front Desk, not a layout of it: a layout shares
 * its world's actions, and new actions would change the Front Desk card's
 * tool list and its golden trace.
 */

export const QUEUE_WORLD_ID = 'workshop/the-desk-queue';
/** The colleague's capacity: more handed over than this, and the queue is not handled well. */
export const COLLEAGUE_CAPACITY = 3;
/** The card's dial's knob, read from `state.config.knobs`. */
export const THRESHOLD_KNOB = 'threshold';
const DEFAULT_THRESHOLD = 0.5;

export type QueueState = DeskState;

/**
 * The six visitors: what the reader says about each note, how sure it is,
 * and what was actually so. Two readings are wrong — one at 55%, one at 40% —
 * so a line between 60% and 80% hands both to the colleague and no more than
 * three in all. Fixed, not drawn: the card is a lesson, and a lesson that
 * moves under the child's feet teaches nothing.
 */
export const VISITORS: ReadonlyArray<{
	id: string;
	name: string;
	note: string;
	reading: 'on the list' | 'not on the list';
	confidence: number;
	onTheList: boolean;
}> = queueStrings.visitors.map((visitor, index) => ({
	id: `visitor-${index + 1}`,
	...visitor
}));

const noteRecord = (visitor: (typeof VISITORS)[number]): DeskRecord => ({
	id: `${visitor.id}-note`,
	kind: 'note',
	title: queueStrings.noteTitle(visitor.name),
	classification: 'personal',
	fields: { visitor: visitor.name, note: visitor.note },
	reading: {
		question: queueStrings.question,
		answer: visitor.reading,
		confidence: visitor.confidence
	}
});

const HOUSE_RULE: DeskRecord = {
	id: 'house-rule',
	kind: 'notice',
	title: deskStrings.records.houseRule.title,
	classification: 'public',
	fields: { text: queueStrings.houseRule }
};

/** The line the child set, from the create-time config; the dial's default when none came. */
export function thresholdOf(state: QueueState): number {
	const knobs = (state.config?.['knobs'] ?? {}) as Record<string, unknown>;
	const value = knobs[THRESHOLD_KNOB];
	return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_THRESHOLD;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

function visitorFor(state: QueueState, named: string) {
	const wanted = named.trim().toLowerCase();
	return VISITORS.find(
		(visitor) =>
			visitor.id === wanted ||
			visitor.name.toLowerCase() === wanted ||
			visitor.name.toLowerCase().split(' ').includes(wanted)
	);
}

const handedOver = (state: QueueState): number =>
	state.queue.filter((item) => item.status === 'escalated').length;

/**
 * Every visitor decided or handed over; nobody let in who was not on the
 * list, nobody turned away who was; the colleague not given more than they
 * can take. Reads truth for "what was actually so" (WP62).
 */
function handledWell(state: QueueState, truth: DeskTruth | undefined): boolean {
	if (state.queue.some((item) => item.status === 'open' || item.status === 'in-progress'))
		return false;
	if (handedOver(state) > COLLEAGUE_CAPACITY) return false;
	return state.queue.every((item) => {
		if (item.status !== 'decided') return true;
		const onTheList = truth?.facts?.[`${item.id}-on-the-list`];
		return item.decision === (onTheList ? queueStrings.letIn : queueStrings.turnedAway);
	});
}

function act(letIn: boolean) {
	return (state: QueueState, args: unknown, ctx: DeskActionContext) => {
		const visitor = visitorFor(state, (args as { visitor: string }).visitor);
		if (!visitor) return { ok: false, narration: queueStrings.narration.noSuchVisitor };
		const item = state.queue.find((entry) => entry.id === visitor.id);
		if (!item || item.status === 'decided' || item.status === 'escalated')
			return { ok: false, narration: queueStrings.narration.alreadyDone(visitor.name) };
		const note = state.records.find((record) => record.id === `${visitor.id}-note`);
		if (!note?.reading)
			return { ok: false, narration: queueStrings.narration.readFirst(visitor.name) };
		const line = thresholdOf(state);
		const sure = note.reading.confidence;
		if (sure < line) {
			// Below the child's line: a person decides, not the bot.
			ctx.decide(visitor.id, queueStrings.handedOver, 'escalated');
			const count = handedOver(state);
			ctx.line(
				'system',
				queueStrings.narration.handedOverLine(visitor.name, percent(sure), percent(line), count)
			);
			if (count > COLLEAGUE_CAPACITY) ctx.alert('warning', queueStrings.narration.swamped(count));
			return {
				ok: true,
				narration: queueStrings.narration.handedOver(visitor.name, percent(sure), percent(line))
			};
		}
		const decision = letIn ? queueStrings.letIn : queueStrings.turnedAway;
		ctx.decide(visitor.id, decision);
		ctx.line(
			'system',
			queueStrings.narration.actedLine(visitor.name, decision, percent(sure), percent(line))
		);
		return { ok: true, narration: queueStrings.narration.acted(visitor.name, decision) };
	};
}

export const queueSpec: DeskWorldSpec = {
	id: QUEUE_WORLD_ID,
	name: queueStrings.title,
	desk: { title: deskStrings.title, role: deskStrings.role },
	purpose: 'reception',
	knobs: [
		{
			id: THRESHOLD_KNOB,
			name: 'Sure enough',
			description:
				'How sure the reader must be before the bot acts alone; below it the visitor goes to a colleague.',
			default: DEFAULT_THRESHOLD
		}
	],
	// No doors: the card is a lesson about the dial, and nothing arrives from outside the queue.
	injections: [],
	layouts: [
		{
			id: 'a-queue',
			name: queueStrings.layout,
			case: () => ({
				revealed: [HOUSE_RULE],
				hidden: VISITORS.map(noteRecord),
				queue: VISITORS.map((visitor) => ({
					id: visitor.id,
					title: visitor.name,
					status: 'open' as const,
					recordIds: [`${visitor.id}-note`]
				})),
				activeCaseId: VISITORS[0]!.id,
				// What was actually so: nothing at the desk reads it; the run's end compares.
				truth: {
					records: [],
					facts: Object.fromEntries(
						VISITORS.map((visitor) => [`${visitor.id}-on-the-list`, visitor.onTheList])
					)
				}
			})
		}
	],
	actions: [
		{
			id: 'read-note',
			name: queueStrings.actions.readNote.name,
			description: queueStrings.actions.readNote.description,
			schema: z.object({ visitor: z.string().min(1).describe(queueStrings.actions.visitorArg) }),
			riskTier: 'observe',
			perform: (state, args, ctx) => {
				const visitor = visitorFor(state, (args as { visitor: string }).visitor);
				if (!visitor) return { ok: false, narration: queueStrings.narration.noSuchVisitor };
				ctx.open(visitor.id);
				const note = ctx.reveal(`${visitor.id}-note`);
				return {
					ok: true,
					narration: queueStrings.narration.read(
						visitor.name,
						note?.reading?.answer ?? visitor.reading,
						percent(note?.reading?.confidence ?? visitor.confidence)
					)
				};
			}
		},
		{
			id: 'let-in',
			name: queueStrings.actions.letIn.name,
			description: queueStrings.actions.letIn.description,
			schema: z.object({ visitor: z.string().min(1).describe(queueStrings.actions.visitorArg) }),
			riskTier: 'reversible',
			progress: true,
			perform: act(true)
		},
		{
			id: 'turn-away',
			name: queueStrings.actions.turnAway.name,
			description: queueStrings.actions.turnAway.description,
			schema: z.object({ visitor: z.string().min(1).describe(queueStrings.actions.visitorArg) }),
			riskTier: 'reversible',
			progress: true,
			perform: act(false)
		}
	],
	senses: [
		{ id: 'case-file', kind: 'case-file', ...deskStrings.senses.caseFile },
		{ id: 'queue', kind: 'queue', ...deskStrings.senses.queue }
	],
	predicates: {
		'queue-handled': { description: queueStrings.predicates.handled, test: handledWell },
		'someone-handed-over': {
			description: queueStrings.predicates.handedOver,
			test: (state) => handedOver(state) > 0
		}
	},
	progress: {
		'queue-handled': (state) => {
			const done = state.queue.filter(
				(item) => item.status === 'decided' || item.status === 'escalated'
			).length;
			return queueStrings.progress(done, state.queue.length, handedOver(state), COLLEAGUE_CAPACITY);
		}
	}
};

export const deskQueue = createDeskWorld(queueSpec);
