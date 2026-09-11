import type {
	AgentHandle,
	ActionCall,
	ActionResult,
	DeskAlert,
	DeskAlertSeverity,
	DeskQueueItem,
	DeskQueueStatus,
	DeskRecord,
	DeskTranscriptSpeaker,
	DeskWorldState,
	Injection,
	JsonSchema,
	Observation,
	RiskTier,
	WorldActionDefinition,
	WorldCreateOptions,
	WorldDefinition,
	WorldInstance,
	WorldLayout,
	WorldSenseDefinition,
	WorldState
} from '@craftabot/core';
import { z, type ZodType } from 'zod';
import { closest } from './closest.js';
import {
	advanceCounterpart,
	freshCounterpartMemory,
	type CounterpartCue,
	type CounterpartMemory,
	type CounterpartScript
} from './counterpart.js';
import { deskMetrics } from './metrics.js';
import { DEFAULT_SEED, seedFrom, seededRandom } from './seeded.js';
import { runtimeStrings } from './strings.js';
import { parseContextSpec, type ContextLevel, type ContextSpec } from '@craftabot/core';

/**
 * **`createDeskWorld`** (WP53 stage B, `43-DESK-WORLDS.md` §4.4): the
 * business-world runtime. A desk author writes a `DeskWorldSpec` — records,
 * case generators, a handful of handlers, senses, predicates — and gets a
 * `WorldDefinition` with `view: 'desk'` whose every `WorldInstance` method
 * the runtime supplies once. A desk never implements `observe`, `perform`,
 * `inject` or `forAgent` (`41-…` §14.1); `forAgent` itself is WP55's.
 *
 * `hidden` is not truth (`41-…` §6.2): it is what a look-up has not yet
 * revealed — a fact the bot may *earn*. Truth (WP54, `45-…` §4.2) is what
 * nobody at the desk can see: a case's `truth` block is kept in the
 * instance's closure beside the state, never in it, so `snapshot()` (and so
 * `world.changed`) cannot carry it; the session reads `truth()` once as the
 * run finishes and writes it to `run.finished.truth`.
 */

/** What is actually so, for evaluators only (WP54, `45-…` §4.2). */
export interface DeskTruth {
	/** Records the evaluators alone may read, in `DeskRecord` shape so the Run Lab's flap draws them. */
	records: DeskRecord[];
	/** Plain facts with no record shape — a label, a band, a flag. */
	facts?: Record<string, string | number | boolean>;
	/**
	 * The case's cohort (WP61, `50-…` §4.3): attribute → value, the fourth
	 * slice key a campaign reads from `run.finished.truth` and never from the
	 * prompt. A value here is either shown on a record or absent from the
	 * snapshot (`checkDesk`'s truth rule).
	 */
	cohort?: Record<string, string>;
}

/** A generated case: what the desk starts with. */
export interface DeskCase<Extra = Record<string, unknown>> {
	/** What the bot may see from the start. */
	revealed: DeskRecord[];
	/** Revealed by a handler's `ctx.reveal`, never in the opening observation. */
	hidden?: DeskRecord[];
	queue: DeskQueueItem[];
	alerts?: DeskAlert[];
	activeCaseId?: string;
	/** Whatever else the desk keeps. Opaque to the runtime; serialised into the snapshot under `extra`. */
	extra?: Extra;
	/**
	 * What is actually so (WP54): never in the snapshot, never in a sense,
	 * never reachable from a handler's context — `ctx.find` searches revealed
	 * and hidden only. A fact a handler must act on belongs in `hidden`; its
	 * label belongs here.
	 */
	truth?: DeskTruth;
	/** This case's person across the desk (WP55, `46-…` §4.2), overriding the desk's default. */
	counterpart?: CounterpartScript;
}

/** A layout is a case generator: the same `random` stream, the same case. */
export interface DeskLayoutSpec<Extra = Record<string, unknown>> {
	id: string;
	name: string;
	/** The case, from the seeded stream — and, since WP78, the create-time config (`{ knobs }`) when the host passed one. */
	case(random: () => number, config?: Record<string, unknown>): DeskCase<Extra>;
}

/**
 * The runtime's own state: the drawable vocabulary plus what the desk keeps.
 * Structurally a `DeskWorldState`, so it draws through `DeskView`; `hidden`
 * is the one field a renderer must not read, and `DeskView` never does.
 */
export type DeskState<Extra = Record<string, unknown>> = DeskWorldState & {
	tick: number;
	hidden: DeskRecord[];
	/** How much of the transcript the bot has been told about (the Playroom's `heardFor` discipline, one seat). */
	heardCursor: number;
	/** `heard` injections scheduled for a later tick, released on the next `observe` once the tick is reached. */
	scheduledHeard: { text: string; atTick: number }[];
	/** `tool-result` injections, by tool id, for a service line to read (WP58). Carried, not consumed, in WP53. */
	toolOverrides: Record<string, unknown>;
	/** What `create` and `configure` were handed (WP78): a desk reads `config.knobs` for its policy. */
	config?: Record<string, unknown>;
	/** The records the context ladder handed over at `create` (WP81), so an evaluator can tell them from what a handler revealed. Present only when a context was configured. */
	contextRecordIds?: string[];
	/**
	 * Where the person across the desk has got to (WP66, `54-…` §4.2): the
	 * rules that have fired and whether they left — in the state so a fork
	 * puts them back and a `once` rule does not fire twice. `DeskView` never
	 * reads it.
	 */
	counterpart?: CounterpartMemory;
	/** How many times the desk's own random has been drawn, so a restore can redraw to the same place (WP66). */
	draws: number;
	extra: Extra;
};

export interface DeskActionContext {
	tick: number;
	random(): number;
	/** Move a record from `hidden` to `records`; returns it, or `undefined` if no such record. Idempotent. */
	reveal(recordId: string): DeskRecord | undefined;
	/** Every record the desk knows, revealed or not — for a handler to search by title. */
	find(predicate: (record: DeskRecord) => boolean): DeskRecord | undefined;
	/**
	 * Take a queue item up: `open` → `in-progress`, and `activeCaseId` follows
	 * (WP62, `51-FS-FRAUD.md` §2 item 1 — the status was unreachable from a
	 * handler). Idempotent on an item already in progress; `false` for an
	 * unknown or closed item.
	 */
	open(queueItemId: string): boolean;
	/** Decide a queue item, or escalate it. */
	decide(
		queueItemId: string,
		decision: string,
		status?: Extract<DeskQueueStatus, 'decided' | 'escalated'>
	): boolean;
	alert(severity: DeskAlertSeverity, text: string): void;
	/** Append a line to the transcript on someone's behalf — a system note, or the counterpart. */
	line(speaker: Exclude<DeskTranscriptSpeaker, 'agent'>, text: string, channel?: string): void;
}

export type DeskActionOutcome = {
	ok: boolean;
	narration: string;
	stateDiff?: ActionResult['stateDiff'];
};

export type DeskActionSpec<Extra = Record<string, unknown>> =
	/** The runtime's own `say`: `{ text }`, appended to the transcript as the agent. */
	| { id: string; kind: 'say'; name?: string; description?: string; riskTier?: RiskTier }
	| {
			id: string;
			name: string;
			description: string;
			/** Zod, as both grid worlds do — the advertised JSON Schema is derived from it and the arguments are parsed by it. */
			schema: ZodType;
			/** Required here, optional on `WorldActionDefinition`: a desk never leaves it unsaid. */
			riskTier: RiskTier;
			progress?: boolean;
			perform(state: DeskState<Extra>, args: unknown, ctx: DeskActionContext): DeskActionOutcome;
	  };

export type DeskSenseSpec<Extra = Record<string, unknown>> =
	/** The runtime's own senses over its own state. */
	| { id: string; kind: 'conversation' | 'case-file' | 'queue'; name: string; description: string }
	| {
			id: string;
			name: string;
			description: string;
			reveal(state: DeskState<Extra>): string | undefined;
	  };

export interface DeskWorldSpec<Extra = Record<string, unknown>> {
	id: string;
	name: string;
	desk: { title: string; role: string };
	/** The purpose this desk reads records for (`41-…` §6.5.1). Carried and shown in WP53; WP54 gates on it. */
	purpose?: string;
	layouts: DeskLayoutSpec<Extra>[];
	actions: DeskActionSpec<Extra>[];
	senses: DeskSenseSpec<Extra>[];
	/**
	 * `test` sees the state and, second, the case's truth (WP62, `51-…` §2):
	 * a rule about what was *so* — every fraud alert actioned — may read it. A
	 * predicate returns a boolean, never a value, so the snapshot still
	 * carries no truth; a spec that ignores the argument is unchanged.
	 */
	predicates: Record<
		string,
		{ description: string; test(state: DeskState<Extra>, truth: DeskTruth | undefined): boolean }
	>;
	/**
	 * What this desk adds at a rung of the context ladder beyond `case-file`
	 * (WP81, `70-…` §4): the customer's related records at `relational`, the
	 * knowledge card at `ontology`. Content the desk knows how to make; a
	 * desk without it adds nothing and the ladder still holds. The runtime
	 * drops any special-category record before it lands.
	 */
	context?(level: ContextLevel, generated: DeskCase<Extra>, spec: ContextSpec): DeskRecord[];
	/** One line of progress per predicate, when the desk can say. */
	progress?: Partial<Record<string, (state: DeskState<Extra>) => string | undefined>>;
	/** Who `receiveInput` and a `heard` injection speak as when no script names them. Default "Customer". */
	counterpartName?: string;
	/**
	 * The desk's default visitor (WP55, `46-…` §4.2): a script advanced inside
	 * `perform` when the agent speaks or acts, its lines in the transcript as
	 * `speaker: 'counterpart'`. A case may override it; a scenario may pick
	 * one from `counterparts` through the `counterpart` injection.
	 */
	counterpart?: CounterpartScript;
	/** The desk's library of personas a scenario may name by id. */
	counterparts?: Record<string, CounterpartScript>;
	/**
	 * What the person across the desk knows (WP55, `46-…` §4.4) — the only
	 * path from truth to a prompt, and it is the counterpart seat's prompt,
	 * never the agent's. A genuine customer knows their own income; a
	 * fraudster knows the cover story.
	 */
	counterpartKnows?: (truth: DeskTruth | undefined, state: DeskState<Extra>) => string | undefined;
	/** Which injection kinds this desk takes. Default: all five. A kind not listed is a no-op. */
	injections?: Injection['kind'][];
}

export interface DeskWorldDefinition<Extra = Record<string, unknown>> extends WorldDefinition {
	view: 'desk';
	/** The spec it was built from, for a conformance kit that wants to look. */
	spec: DeskWorldSpec<Extra>;
}

/**
 * A desk instance (WP64, `56-…` §2 item 10): the script seated across it,
 * readable by a host that wants to give that person a live seat — the
 * name and the persona are the case's, generated with it, so only the
 * instance knows them. Absent on a desk with no script.
 */
export interface DeskWorldInstance extends WorldInstance {
	seatedCounterpart?(): CounterpartScript | undefined;
}

/** The script seated across a desk instance, when it is one and has one. */
export function seatedCounterpartOf(world: WorldInstance): CounterpartScript | undefined {
	const seated = (world as DeskWorldInstance).seatedCounterpart;
	return typeof seated === 'function' ? seated.call(world) : undefined;
}

/** A context-added record under a token budget (WP81): every string field cut to `tokens × 4` characters at a line boundary, with the note. */
function budgeted(record: DeskRecord, tokens: number | undefined): DeskRecord {
	if (tokens === undefined) return record;
	const limit = tokens * 4;
	for (const [key, value] of Object.entries(record.fields)) {
		if (typeof value !== 'string' || value.length <= limit) continue;
		const cut = value.slice(0, limit);
		const atLine = cut.lastIndexOf('\n');
		record.fields[key] =
			`${atLine > 0 ? cut.slice(0, atLine) : cut}\n${runtimeStrings.observation.contextTruncated(tokens)}`;
	}
	return record;
}

const isBuiltInAction = <Extra>(
	action: DeskActionSpec<Extra>
): action is Extract<DeskActionSpec<Extra>, { kind: 'say' }> => 'kind' in action;
const isBuiltInSense = <Extra>(
	sense: DeskSenseSpec<Extra>
): sense is Extract<DeskSenseSpec<Extra>, { kind: string }> => 'kind' in sense;

const SAY_SCHEMA = z.object({ text: z.string().min(1).describe(runtimeStrings.say.text) });
/** The counterpart seat's second action (`46-…` §4.4). */
const HANG_UP = 'hang-up';
const HANG_UP_SCHEMA = z.object({
	reason: z.string().optional().describe(runtimeStrings.hangUp.reason)
});
/** The counterpart seat's own sense: the persona and what truth says it knows. */
const BRIEF = 'brief';
/** Where a seat has heard up to; the solo instance keeps its own in the state. */
type Cursor = { get(): number; set(at: number): void };

export function createDeskWorld<Extra = Record<string, unknown>>(
	spec: DeskWorldSpec<Extra>
): DeskWorldDefinition<Extra> {
	const qualify = (localId: string): string => `${spec.id}/${localId}`;
	const bareOf = (name: string): string =>
		name.startsWith(`${spec.id}/`) ? name.slice(spec.id.length + 1) : name;
	const accepted = new Set<Injection['kind']>(
		spec.injections ?? ['heard', 'manual-entry', 'tool-result', 'radio', 'counterpart']
	);

	function buildState(
		layout: DeskLayoutSpec<Extra>,
		seed: number,
		config?: Record<string, unknown>
	): {
		state: DeskState<Extra>;
		truth: DeskTruth | undefined;
		counterpart: CounterpartScript | undefined;
	} {
		const generated = layout.case(seededRandom(seed), config);
		const state: DeskState<Extra> = {
			desk: { ...spec.desk },
			records: structuredClone(generated.revealed),
			transcript: [],
			queue: structuredClone(generated.queue),
			alerts: structuredClone(generated.alerts ?? []),
			...(generated.activeCaseId !== undefined ? { activeCaseId: generated.activeCaseId } : {}),
			tick: 0,
			draws: 0,
			hidden: structuredClone(generated.hidden ?? []),
			heardCursor: 0,
			scheduledHeard: [],
			toolOverrides: {},
			...(config ? { config: structuredClone(config) } : {}),
			extra: structuredClone(generated.extra ?? ({} as Extra))
		};
		// The rung of the context ladder (WP81, `70-…` §4): composed here, so a reset and a restore rebuild with it.
		const contextConfig = config?.['context'];
		if (contextConfig !== undefined && contextConfig !== null) {
			applyContext(state, generated, parseContextSpec(contextConfig));
		}
		return {
			state,
			truth: generated.truth ? structuredClone(generated.truth) : undefined,
			counterpart: generated.counterpart ?? spec.counterpart
		};
	}

	/** `minimal` keeps the work item; `relational` and `ontology` add what the desk's hook makes; `include`/`exclude`, the budget and the brief delivery apply at every rung. */
	function applyContext(
		state: DeskState<Extra>,
		generated: DeskCase<Extra>,
		context: ContextSpec
	): void {
		const excluded = new Set(context.exclude ?? []);
		const present = new Set(state.records.map((record) => record.id));
		const added: DeskRecord[] = [];
		const admit = (record: DeskRecord): void => {
			if (record.classification === 'special-category') return;
			if (excluded.has(record.kind) || present.has(record.id)) return;
			present.add(record.id);
			added.push(budgeted(structuredClone(record), context.budgetTokens));
		};
		if (context.level === 'minimal') {
			const keep = new Set(state.queue.flatMap((item) => item.recordIds ?? []));
			if (keep.size > 0) state.records = state.records.filter((record) => keep.has(record.id));
		}
		// Each rung is a superset of the one below (`70-…` §2): the ontology rung carries the relational records and the card.
		if (context.level === 'relational' || context.level === 'ontology') {
			for (const record of spec.context?.('relational', generated, context) ?? []) admit(record);
		}
		if (context.level === 'ontology') {
			for (const record of spec.context?.('ontology', generated, context) ?? []) admit(record);
		}
		if (context.include && context.include.length > 0) {
			const wanted = new Set(context.include);
			for (const record of state.hidden) if (wanted.has(record.kind)) admit(record);
		}
		state.records.push(...added);
		state.contextRecordIds = added.map((record) => record.id);
		if (context.delivery.includes('brief') && added.length > 0) {
			const brief = state.records.find((record) => record.id === 'desk-brief');
			if (brief && typeof brief.fields['text'] === 'string') {
				brief.fields['text'] =
					`${brief.fields['text']}\n\n${runtimeStrings.observation.context(added, context.delivery.includes('line'))}`;
			}
		}
	}

	const actionDefinitions: WorldActionDefinition[] = spec.actions.map((action) => {
		if (isBuiltInAction(action)) {
			return {
				id: qualify(action.id),
				name: action.name ?? runtimeStrings.say.name,
				description: action.description ?? runtimeStrings.say.description,
				parameters: z.toJSONSchema(SAY_SCHEMA) as JsonSchema,
				riskTier: action.riskTier ?? 'observe'
			};
		}
		return {
			id: qualify(action.id),
			name: action.name,
			description: action.description,
			parameters: z.toJSONSchema(action.schema) as JsonSchema,
			riskTier: action.riskTier,
			...(action.progress !== undefined ? { progress: action.progress } : {})
		};
	});

	// A desk with a script can seat a live counterpart (`46-…` §4.4): the
	// seat's own action and sense are declared here because the session
	// validates a seat's bricks against the definition. The agent facade
	// refuses `hang-up` and answers `brief` with nothing.
	const hasScript =
		spec.counterpart !== undefined || Object.keys(spec.counterparts ?? {}).length > 0;
	if (hasScript) {
		actionDefinitions.push({
			id: qualify(HANG_UP),
			name: runtimeStrings.hangUp.name,
			description: runtimeStrings.hangUp.description,
			parameters: z.toJSONSchema(HANG_UP_SCHEMA) as JsonSchema,
			riskTier: 'observe'
		});
	}

	const senseDefinitions: WorldSenseDefinition[] = spec.senses.map((sense) => ({
		id: qualify(sense.id),
		name: sense.name,
		description: sense.description
	}));
	if (hasScript) {
		senseDefinitions.push({
			id: qualify(BRIEF),
			name: runtimeStrings.brief.name,
			description: runtimeStrings.brief.description
		});
	}

	const layouts: WorldLayout[] = spec.layouts.map((layout) => ({
		id: layout.id,
		name: layout.name,
		// The case a bare `create(layoutId)` would generate — what a registry or a testkit sees.
		initialState: buildState(layout, DEFAULT_SEED).state as unknown as WorldState
	}));

	function createInstance(layoutId: string, options?: WorldCreateOptions): WorldInstance {
		const layout = spec.layouts.find((candidate) => candidate.id === layoutId);
		if (!layout) {
			throw new Error(
				`Unknown ${spec.name} layout "${layoutId}". Known layouts: ${spec.layouts
					.map((candidate) => candidate.id)
					.join(', ')}.`
			);
		}
		const seed = seedFrom(options?.random);
		// The create-time config (WP78): part of how the case was made, so a reset and a restore rebuild with it.
		const config = options?.config;
		const built = buildState(layout, seed, config);
		let state = built.state;
		// Beside the state, never in it (`45-…` §4.2): nothing that clones the
		// state can reach it, and nothing but `truth()` reads it.
		let truth = built.truth;
		let baseRandom = seededRandom(seed ^ 0x9e3779b9);
		// Counted in the state (WP66): a restore reseeds and redraws `state.draws` times.
		const random = (): number => {
			state.draws += 1;
			return baseRandom();
		};
		let seq = 0;
		// The person across the desk (`46-…` §4.2): the script and where it has
		// got to, in the closure like the truth; the transcript is what shows.
		let counterpart: { script: CounterpartScript; memory: CounterpartMemory } | undefined;
		function seat(script: CounterpartScript | undefined): void {
			counterpart = script ? { script, memory: freshCounterpartMemory() } : undefined;
			if (counterpart) state.counterpart = counterpart.memory;
			if (script?.opening) line('counterpart', script.name, script.opening);
		}
		/** A live counterpart seat, once bound, speaks instead of the script (`46-…` §4.4). */
		let scriptSuspended = false;
		const boundRoles = new Set<string>();
		function speak(cue: CounterpartCue): void {
			if (!counterpart || scriptSuspended) return;
			const { turn, memory } = advanceCounterpart(
				counterpart.script,
				cue,
				counterpart.memory,
				state.tick,
				random
			);
			counterpart.memory = memory;
			state.counterpart = memory;
			if (!turn) return;
			const name = counterpart.script.name;
			if (turn.text !== undefined) {
				line('counterpart', name, turn.text, undefined, {
					...(turn.rule?.pressure !== undefined ? { pressure: turn.rule.pressure } : {}),
					...(turn.rule?.tags !== undefined && turn.rule.tags.length > 0
						? { tags: [...turn.rule.tags] }
						: {})
				});
			}
			if (turn.then === 'escalate') {
				state.alerts.push({
					id: `alert-${state.alerts.length + 1}`,
					severity: 'warning',
					text: runtimeStrings.narration.counterpartEscalates(name),
					tick: state.tick
				});
			}
			if (turn.then === 'end-conversation') {
				line('system', runtimeStrings.systemName, runtimeStrings.narration.counterpartLeft(name));
			}
		}

		function line(
			speaker: DeskTranscriptSpeaker,
			speakerName: string,
			text: string,
			channel?: string,
			extras: { pressure?: number; tags?: string[] } = {}
		): void {
			seq += 1;
			state.transcript.push({
				seq,
				tick: state.tick,
				speaker,
				speakerName,
				text,
				...(channel !== undefined ? { channel } : {}),
				...extras
			});
		}

		function counterpartName(): string {
			return counterpart?.script.name ?? spec.counterpartName ?? runtimeStrings.counterpartName;
		}

		function releaseScheduledHeard(): void {
			if (state.scheduledHeard.length === 0) return;
			const due = state.scheduledHeard.filter((entry) => entry.atTick <= state.tick);
			if (due.length === 0) return;
			state.scheduledHeard = state.scheduledHeard.filter((entry) => entry.atTick > state.tick);
			for (const entry of due) {
				line('counterpart', counterpartName(), entry.text);
			}
		}

		function context(): DeskActionContext {
			return {
				tick: state.tick,
				random,
				reveal(recordId) {
					const already = state.records.find((record) => record.id === recordId);
					if (already) return already;
					const index = state.hidden.findIndex((record) => record.id === recordId);
					if (index === -1) return undefined;
					const [record] = state.hidden.splice(index, 1);
					if (record) state.records.push(record);
					return record;
				},
				find(predicate) {
					return [...state.records, ...state.hidden].find(predicate);
				},
				open(queueItemId) {
					const item = state.queue.find((entry) => entry.id === queueItemId);
					if (!item || item.status === 'decided' || item.status === 'escalated') return false;
					item.status = 'in-progress';
					state.activeCaseId = queueItemId;
					return true;
				},
				decide(queueItemId, decision, status = 'decided') {
					const item = state.queue.find((entry) => entry.id === queueItemId);
					if (!item) return false;
					item.status = status;
					item.decision = decision;
					return true;
				},
				alert(severity, text) {
					state.alerts.push({
						id: `alert-${state.alerts.length + 1}`,
						severity,
						text,
						tick: state.tick
					});
				},
				line(speaker, text, channel) {
					const name = speaker === 'system' ? runtimeStrings.systemName : counterpartName();
					line(speaker, name, text, channel);
				}
			};
		}

		function hasChannel(channels: readonly string[], localId: string): boolean {
			return channels.includes(localId) || channels.includes(qualify(localId));
		}

		/** The solo instance's cursor lives in the state (WP53); a seat's lives in its facade (`46-…` §4.4). */
		const stateCursor: Cursor = {
			get: () => state.heardCursor,
			set: (at) => {
				state.heardCursor = at;
			}
		};

		function conversationSince(cursor: Cursor): string {
			const unheard = state.transcript.slice(cursor.get());
			cursor.set(state.transcript.length);
			return unheard.length === 0
				? runtimeStrings.observation.nothingSaid
				: runtimeStrings.observation.heard(
						unheard.map((entry) => `${entry.speakerName}: ${entry.text}`)
					);
		}

		function finishObservation(used: string[], lines: string[]): Observation {
			const open = state.queue.filter(
				(item) => item.status === 'open' || item.status === 'in-progress'
			).length;
			const last = state.transcript.at(-1);
			return {
				channels: used,
				text: lines.length === 0 ? runtimeStrings.observation.noSenses : lines.join('\n'),
				summary: runtimeStrings.observation.summary(open, state.queue.length - open, last?.text)
			};
		}

		function observe(channels: readonly string[]): Observation {
			return observeAs(channels, stateCursor);
		}

		/** What the context ladder handed over (WP81, `70-…` §4), in the observation whatever senses are on, when the rung asked for the sense delivery. */
		function contextLines(used: string[], lines: string[]): void {
			const ids = state.contextRecordIds;
			if (!ids || ids.length === 0) return;
			const context = state.config?.['context'] as ContextSpec | undefined;
			if (!context || !context.delivery.includes('sense')) return;
			const records = state.records.filter((record) => ids.includes(record.id));
			if (records.length === 0) return;
			used.push(qualify('context'));
			lines.push(runtimeStrings.observation.context(records, context.delivery.includes('line')));
		}

		/** The agent's view: every sense the desk declares, the conversation since this seat's cursor. */
		function observeAs(channels: readonly string[], cursor: Cursor): Observation {
			releaseScheduledHeard();
			const used: string[] = [];
			const lines: string[] = [];
			for (const sense of spec.senses) {
				if (!hasChannel(channels, sense.id)) continue;
				let text: string | undefined;
				if (isBuiltInSense(sense)) {
					if (sense.kind === 'conversation') {
						text = conversationSince(cursor);
					} else if (sense.kind === 'case-file') {
						text = runtimeStrings.observation.caseFile(state.records);
					} else {
						text = runtimeStrings.observation.queue(state.queue);
					}
				} else {
					text = sense.reveal(state);
				}
				if (text === undefined) continue;
				used.push(sense.id);
				lines.push(text);
			}
			contextLines(used, lines);
			return finishObservation(used, lines);
		}

		/** The counterpart seat's view (`46-…` §4.4): the conversation and its own brief, nothing of the desk. */
		function observeAsCounterpart(channels: readonly string[], cursor: Cursor): Observation {
			releaseScheduledHeard();
			const used: string[] = [];
			const lines: string[] = [];
			const conversation = spec.senses.find(
				(sense) => isBuiltInSense(sense) && sense.kind === 'conversation'
			);
			if (conversation && hasChannel(channels, conversation.id)) {
				used.push(conversation.id);
				lines.push(conversationSince(cursor));
			}
			if (hasChannel(channels, BRIEF) && counterpart) {
				used.push(BRIEF);
				lines.push(
					runtimeStrings.observation.brief(
						counterpart.script.persona,
						spec.counterpartKnows?.(truth, state)
					)
				);
			}
			return finishObservation(used, lines);
		}

		function perform(call: ActionCall): ActionResult {
			return performAs(call, runtimeStrings.agentName);
		}

		function performAs(call: ActionCall, speakerName: string): ActionResult {
			// A turn is a turn, legal or not — both grid worlds' own clock discipline.
			state.tick += 1;
			const bare = bareOf(call.name);
			if (bare === HANG_UP) {
				return {
					ok: false,
					narration: runtimeStrings.narration.onlyTheVisitorHangsUp,
					stateDiff: []
				};
			}
			const action = spec.actions.find((candidate) => candidate.id === bare);
			if (!action) {
				return {
					ok: false,
					narration: runtimeStrings.narration.unknownAction(call.name),
					stateDiff: [],
					didYouMean: closest(
						bare,
						spec.actions.map((candidate) => candidate.id)
					)
				};
			}
			if (isBuiltInAction(action)) {
				const parsed = SAY_SCHEMA.safeParse(call.arguments ?? {});
				if (!parsed.success) return badArguments(action.id, parsed.error);
				line('agent', speakerName, parsed.data.text);
				const before = seq;
				speak({ kind: 'said', text: parsed.data.text });
				return {
					ok: true,
					narration: runtimeStrings.narration.said(parsed.data.text),
					stateDiff: [{ path: 'transcript.length', from: before - 1, to: seq }]
				};
			}
			const parsed = action.schema.safeParse(call.arguments ?? {});
			if (!parsed.success) return badArguments(action.id, parsed.error);
			const outcome = action.perform(state, parsed.data, context());
			speak({ kind: 'acted', actionId: action.id });
			return {
				ok: outcome.ok,
				narration: outcome.narration,
				stateDiff: outcome.stateDiff ?? []
			};
		}

		function badArguments(actionId: string, error: z.ZodError): ActionResult {
			const problem = error.issues
				.map((issue) => `${issue.path.join('.') || 'arguments'} — ${issue.message}`)
				.join('; ');
			return {
				ok: false,
				narration: runtimeStrings.narration.badArguments(actionId, problem),
				stateDiff: []
			};
		}

		seat(built.counterpart);

		function performAsCounterpart(call: ActionCall, handle: AgentHandle): ActionResult {
			state.tick += 1;
			const bare = bareOf(call.name);
			if (bare === HANG_UP) {
				const parsed = HANG_UP_SCHEMA.safeParse(call.arguments ?? {});
				if (!parsed.success) return badArguments(HANG_UP, parsed.error);
				if (counterpart) counterpart.memory = { ...counterpart.memory, ended: true };
				line(
					'system',
					runtimeStrings.systemName,
					runtimeStrings.narration.hungUp(handle.name, parsed.data.reason)
				);
				return {
					ok: true,
					narration: runtimeStrings.narration.hungUp(handle.name, parsed.data.reason),
					stateDiff: []
				};
			}
			const action = spec.actions.find((candidate) => candidate.id === bare);
			if (action && isBuiltInAction(action)) {
				const parsed = SAY_SCHEMA.safeParse(call.arguments ?? {});
				if (!parsed.success) return badArguments(action.id, parsed.error);
				const before = seq;
				line('counterpart', handle.name, parsed.data.text);
				return {
					ok: true,
					narration: runtimeStrings.narration.said(parsed.data.text),
					stateDiff: [{ path: 'transcript.length', from: before, to: seq }]
				};
			}
			return {
				ok: false,
				narration: runtimeStrings.narration.counterpartCannot(bare),
				stateDiff: []
			};
		}

		/**
		 * Two seats over one desk (`46-…` §4.4): the clerk, and the person
		 * across from them. Each seat hears the conversation from its own
		 * cursor; the counterpart's only actions are to speak and to hang up,
		 * and its only other sense is its brief. Binding a counterpart seat
		 * suspends the scripted visitor — one visitor, not two.
		 */
		function forAgent(handle: AgentHandle): WorldInstance {
			const role = handle.role ?? 'agent';
			let at = 0;
			const cursor: Cursor = {
				get: () => at,
				set: (value) => {
					at = value;
				}
			};
			const shared: Pick<
				WorldInstance,
				'snapshot' | 'test' | 'reset' | 'receiveInput' | 'configure' | 'inject'
			> = {
				snapshot: () => instance.snapshot(),
				test: (predicate) => instance.test(predicate),
				reset: () => instance.reset(),
				receiveInput: (text) => instance.receiveInput?.(text),
				configure: (config) => instance.configure?.(config),
				inject: (injection) => instance.inject?.(injection)
			};
			if (role === 'counterpart') {
				boundRoles.add('counterpart');
				scriptSuspended = true;
				return {
					...shared,
					observe: (channels) => observeAsCounterpart(channels, cursor),
					perform: (call) => performAsCounterpart(call, handle),
					describeProgress: () => undefined
				};
			}
			if (boundRoles.has('agent')) throw new Error(runtimeStrings.narration.secondAgentSeat);
			boundRoles.add('agent');
			return {
				...shared,
				...(built.truth !== undefined ? { truth: () => instance.truth?.() } : {}),
				observe: (channels) => observeAs(channels, cursor),
				perform: (call) => performAs(call, handle.name),
				describeProgress: (predicate, channels) => instance.describeProgress?.(predicate, channels)
			};
		}

		const instance: WorldInstance = {
			snapshot(): WorldState {
				return structuredClone(state) as unknown as WorldState;
			},
			observe,
			perform,
			test(predicate): boolean {
				const check = spec.predicates[predicate];
				return check ? check.test(state, truth) : false;
			},
			reset(): void {
				const rebuilt = buildState(layout, seed, config);
				state = rebuilt.state;
				truth = rebuilt.truth;
				baseRandom = seededRandom(seed ^ 0x9e3779b9);
				seq = 0;
				seat(rebuilt.counterpart);
			},
			// A fork's door (WP66, `54-…` §4.2): the state wholesale, the counterpart's memory from it, the random redrawn to where it was.
			restore(snapshot): void {
				state = structuredClone(snapshot) as unknown as DeskState<Extra>;
				seq = state.transcript.reduce((max, line) => Math.max(max, line.seq), 0);
				baseRandom = seededRandom(seed ^ 0x9e3779b9);
				const draws = state.draws;
				state.draws = 0;
				for (let i = 0; i < draws; i += 1) random();
				if (counterpart) counterpart.memory = state.counterpart ?? freshCounterpartMemory();
			},
			// Present only when the case has a truth, so `'truth' in instance` is
			// honest for a desk that keeps nothing from the bot (the golden desk).
			...(built.truth !== undefined
				? { truth: (): unknown => (truth ? structuredClone(truth) : undefined) }
				: {}),
			receiveInput(text: string): void {
				line('counterpart', counterpartName(), text);
			},
			describeProgress(predicate, channels): string | undefined {
				// Progress is perception (`world.ts`'s own rule): only a bot that can
				// hear the desk or see the queue is told how the job is going.
				const perceives = spec.senses.some(
					(sense) =>
						isBuiltInSense(sense) &&
						(sense.kind === 'conversation' || sense.kind === 'queue') &&
						hasChannel(channels, sense.id)
				);
				if (!perceives) return undefined;
				return spec.progress?.[predicate]?.(state);
			},
			configure(config): void {
				state.config = { ...(state.config ?? {}), ...config };
			},
			inject(injection: Injection): void {
				if (!accepted.has(injection.kind)) return;
				switch (injection.kind) {
					case 'heard':
						if (injection.atTick !== undefined && injection.atTick > state.tick) {
							state.scheduledHeard.push({ text: injection.text, atTick: injection.atTick });
						} else {
							line('counterpart', counterpartName(), injection.text);
						}
						break;
					case 'manual-entry':
						state.records.push({
							id: `manual/${injection.key}`,
							kind: 'manual',
							title: injection.key,
							fields: { text: injection.text }
						});
						line(
							'system',
							runtimeStrings.systemName,
							runtimeStrings.narration.manualEntry(injection.key)
						);
						break;
					case 'tool-result':
						state.toolOverrides[injection.toolId] = injection.result;
						break;
					case 'radio':
						line('system', injection.fromName, injection.text, injection.channel);
						break;
					case 'counterpart': {
						const script = spec.counterparts?.[injection.scriptId];
						if (script) seat(script);
						break;
					}
				}
			}
		};

		const seated: DeskWorldInstance = {
			...instance,
			forAgent,
			seatedCounterpart: () => counterpart?.script
		};
		return seated;
	}

	return {
		id: spec.id,
		name: spec.name,
		view: 'desk',
		layouts,
		actions: actionDefinitions,
		senses: senseDefinitions,
		predicates: Object.fromEntries(
			Object.entries(spec.predicates).map(([id, predicate]) => [id, predicate.description])
		),
		create: createInstance,
		// The five per-case metrics (WP61), folded by a campaign over a finished run.
		metrics: deskMetrics(
			(actionName) =>
				actionDefinitions.find(
					(action) => action.id === actionName || action.id.endsWith(`/${bareOf(actionName)}`)
				)?.riskTier
		),
		spec
	};
}
