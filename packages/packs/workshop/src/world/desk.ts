import type {
	ActionCall,
	ActionResult,
	DeskRecord,
	DeskWorldState,
	Injection,
	Observation,
	RiskTier,
	WorldActionDefinition,
	WorldDefinition,
	WorldInstance,
	WorldState
} from '@craftabot/core';
import { z } from 'zod';
import { deskStrings } from '../strings.js';

/**
 * **The Front Desk** (WP53 stage A, `43-DESK-WORLDS.md` §4.3) — the first
 * world in the product that is not a room: a receptionist's desk with one
 * visitor to sign in. Two records, one queue item, four actions, three
 * senses, three predicates. It exists so a Desk can appear on every screen
 * that shows a world before `@craftabot/desk` exists (stage B rewrites it on
 * the runtime, keeping every id, its card and its e2e).
 *
 * Hand-written on purpose and small on purpose: it is the last world anyone
 * should write this way, and its size is the argument for the runtime.
 *
 * Its state is structurally a `DeskWorldState` (`@craftabot/core`) plus the
 * three things this world keeps for itself: its clock, the records a
 * look-up has not yet revealed, and how much of the transcript the bot has
 * already been told about.
 */

export const FRONT_DESK_WORLD_ID = 'workshop/the-desk';
export const qualifyDeskId = (localId: string): string => `${FRONT_DESK_WORLD_ID}/${localId}`;

export type FrontDeskState = DeskWorldState & {
	tick: number;
	hidden: DeskRecord[];
	heardCursor: number;
};

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

function freshState(): FrontDeskState {
	return {
		desk: { title: deskStrings.title, role: deskStrings.role },
		records: [HOUSE_RULE],
		hidden: [VISITOR],
		transcript: [],
		queue: [
			{ id: 'sign-in', title: deskStrings.queue.signIn, status: 'open', recordIds: ['visitor'] }
		],
		alerts: [],
		activeCaseId: 'sign-in',
		tick: 0,
		heardCursor: 0
	};
}

export const frontDeskLayouts = [
	{ id: 'a-visitor', name: deskStrings.layout, initialState: freshState() as WorldState }
];

// ---------------------------------------------------------------- actions

type Outcome = {
	ok: boolean;
	narration: string;
	stateDiff: { path: string; from: unknown; to: unknown }[];
};

type ActionSpec<Schema extends z.ZodType> = {
	id: string;
	name: string;
	description: string;
	schema: Schema;
	riskTier: RiskTier;
	progress?: boolean;
	run: (state: FrontDeskState, args: z.infer<Schema>) => Outcome;
};

type FrontDeskAction = {
	definition: WorldActionDefinition;
	perform: (state: FrontDeskState, args: unknown) => Outcome;
};

function appendLine(
	state: FrontDeskState,
	speaker: 'agent' | 'counterpart' | 'system',
	speakerName: string,
	text: string,
	channel?: string
): void {
	state.transcript.push({
		seq: state.transcript.length + 1,
		tick: state.tick,
		speaker,
		speakerName,
		text,
		...(channel !== undefined ? { channel } : {})
	});
}

function defineAction<Schema extends z.ZodType>(spec: ActionSpec<Schema>): FrontDeskAction {
	return {
		definition: {
			id: spec.id,
			name: spec.name,
			description: spec.description,
			parameters: z.toJSONSchema(spec.schema),
			riskTier: spec.riskTier,
			...(spec.progress !== undefined ? { progress: spec.progress } : {})
		},
		perform: (state, args) => {
			const parsed = spec.schema.safeParse(args ?? {});
			if (!parsed.success) {
				const problem = parsed.error.issues
					.map((issue) => `${issue.path.join('.') || 'arguments'} — ${issue.message}`)
					.join('; ');
				return {
					ok: false,
					narration: deskStrings.narration.badArguments(spec.id, problem),
					stateDiff: []
				};
			}
			return spec.run(state, parsed.data);
		}
	};
}

const say = defineAction({
	id: 'say',
	name: deskStrings.actions.say.name,
	description: deskStrings.actions.say.description,
	schema: z.object({ text: z.string().min(1).describe(deskStrings.actions.say.text) }),
	riskTier: 'observe',
	run: (state, args) => {
		appendLine(state, 'agent', deskStrings.agentName, args.text);
		return {
			ok: true,
			narration: deskStrings.narration.said(args.text),
			stateDiff: [
				{
					path: 'transcript.length',
					from: state.transcript.length - 1,
					to: state.transcript.length
				}
			]
		};
	}
});

const lookUp = defineAction({
	id: 'look-up',
	name: deskStrings.actions.lookUp.name,
	description: deskStrings.actions.lookUp.description,
	schema: z.object({ record: z.string().min(1).describe(deskStrings.actions.lookUp.record) }),
	riskTier: 'observe',
	run: (state, args) => {
		const wanted = args.record.trim().toLowerCase();
		const known = [...state.records, ...state.hidden];
		const match = known.find(
			(record) =>
				record.id === wanted || record.title.toLowerCase() === wanted || record.kind === wanted
		);
		if (!match) {
			return {
				ok: false,
				narration: deskStrings.narration.noSuchRecord(
					args.record,
					known.map((record) => record.title)
				),
				stateDiff: []
			};
		}
		const wasHidden = state.hidden.some((record) => record.id === match.id);
		if (wasHidden) {
			state.hidden = state.hidden.filter((record) => record.id !== match.id);
			state.records.push(match);
		}
		return {
			ok: true,
			narration: deskStrings.narration.lookedUp(match),
			stateDiff: wasHidden
				? [{ path: `records.${match.id}`, from: undefined, to: match.title }]
				: []
		};
	}
});

const signIn = defineAction({
	id: 'sign-in',
	name: deskStrings.actions.signIn.name,
	description: deskStrings.actions.signIn.description,
	schema: z.object({ visitor: z.string().min(1).describe(deskStrings.actions.signIn.visitor) }),
	riskTier: 'reversible',
	progress: true,
	run: (state, args) => {
		const item = state.queue.find((entry) => entry.id === 'sign-in');
		if (!item || item.status === 'decided') {
			return { ok: false, narration: deskStrings.narration.alreadySignedIn, stateDiff: [] };
		}
		const from = item.status;
		item.status = 'decided';
		item.decision = deskStrings.narration.signedInDecision(args.visitor);
		appendLine(
			state,
			'system',
			deskStrings.systemName,
			deskStrings.narration.signedInLine(args.visitor)
		);
		return {
			ok: true,
			narration: deskStrings.narration.signedIn(args.visitor),
			stateDiff: [{ path: 'queue.sign-in.status', from, to: 'decided' }]
		};
	}
});

const escalate = defineAction({
	id: 'escalate',
	name: deskStrings.actions.escalate.name,
	description: deskStrings.actions.escalate.description,
	schema: z.object({ reason: z.string().min(1).describe(deskStrings.actions.escalate.reason) }),
	riskTier: 'reversible',
	run: (state, args) => {
		const item = state.queue.find((entry) => entry.id === 'sign-in');
		if (!item || item.status === 'decided' || item.status === 'escalated') {
			return { ok: false, narration: deskStrings.narration.cannotEscalate, stateDiff: [] };
		}
		const from = item.status;
		item.status = 'escalated';
		item.decision = args.reason;
		state.alerts.push({
			id: `alert-${state.alerts.length + 1}`,
			severity: 'warning',
			text: deskStrings.narration.escalatedAlert(args.reason),
			tick: state.tick
		});
		return {
			ok: true,
			narration: deskStrings.narration.escalated(args.reason),
			stateDiff: [{ path: 'queue.sign-in.status', from, to: 'escalated' }]
		};
	}
});

export const frontDeskActions: FrontDeskAction[] = [say, lookUp, signIn, escalate];
export const frontDeskActionDefinitions: WorldActionDefinition[] = frontDeskActions.map(
	(action) => action.definition
);

function findAction(name: string): FrontDeskAction | undefined {
	return frontDeskActions.find(
		(action) => action.definition.id === name || name === qualifyDeskId(action.definition.id)
	);
}

// ----------------------------------------------------------------- senses

export const SENSE_CONVERSATION = 'conversation';
export const SENSE_CASE_FILE = 'case-file';
export const SENSE_QUEUE = 'queue';

export const frontDeskSenses = [
	{ id: SENSE_CONVERSATION, ...deskStrings.senses.conversation },
	{ id: SENSE_CASE_FILE, ...deskStrings.senses.caseFile },
	{ id: SENSE_QUEUE, ...deskStrings.senses.queue }
];

function hasChannel(channels: readonly string[], id: string): boolean {
	return channels.includes(id) || channels.includes(qualifyDeskId(id));
}

export function observeFrontDesk(state: FrontDeskState, channels: readonly string[]): Observation {
	const lines: string[] = [];
	const used: string[] = [];
	if (hasChannel(channels, SENSE_CONVERSATION)) {
		used.push(SENSE_CONVERSATION);
		const unheard = state.transcript.slice(state.heardCursor);
		state.heardCursor = state.transcript.length;
		lines.push(
			unheard.length === 0
				? deskStrings.observation.nothingSaid
				: deskStrings.observation.heard(unheard.map((line) => `${line.speakerName}: ${line.text}`))
		);
	}
	if (hasChannel(channels, SENSE_CASE_FILE)) {
		used.push(SENSE_CASE_FILE);
		lines.push(deskStrings.observation.caseFile(state.records));
	}
	if (hasChannel(channels, SENSE_QUEUE)) {
		used.push(SENSE_QUEUE);
		lines.push(deskStrings.observation.queue(state.queue));
	}
	const open = state.queue.filter(
		(item) => item.status === 'open' || item.status === 'in-progress'
	).length;
	const last = state.transcript.at(-1);
	return {
		channels: used,
		text: lines.length === 0 ? deskStrings.observation.noSenses : lines.join('\n'),
		summary: deskStrings.observation.summary(open, state.queue.length - open, last?.text)
	};
}

// ------------------------------------------------------------- predicates

export const frontDeskPredicates: Record<string, (state: FrontDeskState) => boolean> = {
	'visitor-signed-in': (state) =>
		state.queue.some((item) => item.id === 'sign-in' && item.status === 'decided'),
	escalated: (state) => state.queue.some((item) => item.status === 'escalated'),
	'conversation-started': (state) => state.transcript.some((line) => line.speaker === 'agent')
};

export const frontDeskPredicateDescriptions: Record<string, string> = {
	'visitor-signed-in': deskStrings.predicates.visitorSignedIn,
	escalated: deskStrings.predicates.escalated,
	'conversation-started': deskStrings.predicates.conversationStarted
};

// --------------------------------------------------------------- instance

function createFrontDeskInstance(layoutId: string): WorldInstance {
	const layout = frontDeskLayouts.find((candidate) => candidate.id === layoutId);
	if (!layout) {
		throw new Error(
			`Unknown Front Desk layout "${layoutId}". Known layouts: ${frontDeskLayouts
				.map((candidate) => candidate.id)
				.join(', ')}.`
		);
	}
	let state: FrontDeskState = structuredClone(layout.initialState) as FrontDeskState;

	return {
		snapshot(): WorldState {
			return structuredClone(state);
		},
		observe(channels): Observation {
			return observeFrontDesk(state, channels);
		},
		perform(action: ActionCall): ActionResult {
			state.tick += 1;
			const handler = findAction(action.name);
			if (!handler) {
				return {
					ok: false,
					narration: deskStrings.narration.unknownAction(action.name),
					stateDiff: [],
					didYouMean: frontDeskActions.map((entry) => entry.definition.id)
				};
			}
			return handler.perform(state, action.arguments);
		},
		test(predicate): boolean {
			const check = frontDeskPredicates[predicate];
			return check ? check(state) : false;
		},
		reset(): void {
			state = structuredClone(layout.initialState) as FrontDeskState;
		},
		receiveInput(text: string): void {
			appendLine(state, 'counterpart', deskStrings.counterpartName, text);
		},
		describeProgress(predicate, channels): string | undefined {
			if (!hasChannel(channels, SENSE_QUEUE) && !hasChannel(channels, SENSE_CONVERSATION))
				return undefined;
			if (predicate !== 'visitor-signed-in') return undefined;
			return frontDeskPredicates['visitor-signed-in']?.(state)
				? deskStrings.progress.signedIn
				: deskStrings.progress.notYet;
		},
		inject(injection: Injection): void {
			// `heard` is the one door this desk has (`43-…` §4.3); the other
			// three kinds are for the runtime (stage B) and a scenario carrying
			// them is refused before the run by the session's own check.
			if (injection.kind === 'heard') {
				appendLine(state, 'counterpart', deskStrings.counterpartName, injection.text);
			}
		}
	};
}

export const frontDesk: WorldDefinition = {
	id: FRONT_DESK_WORLD_ID,
	name: deskStrings.title,
	view: 'desk',
	layouts: frontDeskLayouts,
	actions: frontDeskActionDefinitions.map((action) => ({
		...action,
		id: qualifyDeskId(action.id)
	})),
	senses: frontDeskSenses.map((sense) => ({ ...sense, id: qualifyDeskId(sense.id) })),
	predicates: frontDeskPredicateDescriptions,
	create: createFrontDeskInstance
};
