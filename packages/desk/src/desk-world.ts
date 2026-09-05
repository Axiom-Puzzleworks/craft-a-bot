import type {
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
import { DEFAULT_SEED, seedFrom, seededRandom } from './seeded.js';
import { runtimeStrings } from './strings.js';

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
}

/** A layout is a case generator: the same `random` stream, the same case. */
export interface DeskLayoutSpec<Extra = Record<string, unknown>> {
	id: string;
	name: string;
	case(random: () => number): DeskCase<Extra>;
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
	/** What `configure` was handed. Nothing reads it yet. */
	config?: Record<string, unknown>;
	extra: Extra;
};

export interface DeskActionContext {
	tick: number;
	random(): number;
	/** Move a record from `hidden` to `records`; returns it, or `undefined` if no such record. Idempotent. */
	reveal(recordId: string): DeskRecord | undefined;
	/** Every record the desk knows, revealed or not — for a handler to search by title. */
	find(predicate: (record: DeskRecord) => boolean): DeskRecord | undefined;
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
	predicates: Record<string, { description: string; test(state: DeskState<Extra>): boolean }>;
	/** One line of progress per predicate, when the desk can say. */
	progress?: Partial<Record<string, (state: DeskState<Extra>) => string | undefined>>;
	/** Who `receiveInput` and a `heard` injection speak as. Default "Customer". */
	counterpartName?: string;
	/** Which injection kinds this desk takes. Default: all four. A kind not listed is a no-op. */
	injections?: Injection['kind'][];
}

export interface DeskWorldDefinition<Extra = Record<string, unknown>> extends WorldDefinition {
	view: 'desk';
	/** The spec it was built from, for a conformance kit that wants to look. */
	spec: DeskWorldSpec<Extra>;
}

const isBuiltInAction = <Extra>(
	action: DeskActionSpec<Extra>
): action is Extract<DeskActionSpec<Extra>, { kind: 'say' }> => 'kind' in action;
const isBuiltInSense = <Extra>(
	sense: DeskSenseSpec<Extra>
): sense is Extract<DeskSenseSpec<Extra>, { kind: string }> => 'kind' in sense;

const SAY_SCHEMA = z.object({ text: z.string().min(1).describe(runtimeStrings.say.text) });

export function createDeskWorld<Extra = Record<string, unknown>>(
	spec: DeskWorldSpec<Extra>
): DeskWorldDefinition<Extra> {
	const qualify = (localId: string): string => `${spec.id}/${localId}`;
	const bareOf = (name: string): string =>
		name.startsWith(`${spec.id}/`) ? name.slice(spec.id.length + 1) : name;
	const accepted = new Set<Injection['kind']>(
		spec.injections ?? ['heard', 'manual-entry', 'tool-result', 'radio']
	);

	function buildState(
		layout: DeskLayoutSpec<Extra>,
		seed: number
	): { state: DeskState<Extra>; truth: DeskTruth | undefined } {
		const generated = layout.case(seededRandom(seed));
		const state: DeskState<Extra> = {
			desk: { ...spec.desk },
			records: structuredClone(generated.revealed),
			transcript: [],
			queue: structuredClone(generated.queue),
			alerts: structuredClone(generated.alerts ?? []),
			...(generated.activeCaseId !== undefined ? { activeCaseId: generated.activeCaseId } : {}),
			tick: 0,
			hidden: structuredClone(generated.hidden ?? []),
			heardCursor: 0,
			scheduledHeard: [],
			toolOverrides: {},
			extra: structuredClone(generated.extra ?? ({} as Extra))
		};
		return { state, truth: generated.truth ? structuredClone(generated.truth) : undefined };
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

	const senseDefinitions: WorldSenseDefinition[] = spec.senses.map((sense) => ({
		id: qualify(sense.id),
		name: sense.name,
		description: sense.description
	}));

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
		const built = buildState(layout, seed);
		let state = built.state;
		// Beside the state, never in it (`45-…` §4.2): nothing that clones the
		// state can reach it, and nothing but `truth()` reads it.
		let truth = built.truth;
		let random = seededRandom(seed ^ 0x9e3779b9);
		let seq = 0;

		function line(
			speaker: DeskTranscriptSpeaker,
			speakerName: string,
			text: string,
			channel?: string
		): void {
			seq += 1;
			state.transcript.push({
				seq,
				tick: state.tick,
				speaker,
				speakerName,
				text,
				...(channel !== undefined ? { channel } : {})
			});
		}

		function releaseScheduledHeard(): void {
			if (state.scheduledHeard.length === 0) return;
			const due = state.scheduledHeard.filter((entry) => entry.atTick <= state.tick);
			if (due.length === 0) return;
			state.scheduledHeard = state.scheduledHeard.filter((entry) => entry.atTick > state.tick);
			for (const entry of due) {
				line('counterpart', spec.counterpartName ?? runtimeStrings.counterpartName, entry.text);
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
					const name =
						speaker === 'system'
							? runtimeStrings.systemName
							: (spec.counterpartName ?? runtimeStrings.counterpartName);
					line(speaker, name, text, channel);
				}
			};
		}

		function hasChannel(channels: readonly string[], localId: string): boolean {
			return channels.includes(localId) || channels.includes(qualify(localId));
		}

		function observe(channels: readonly string[]): Observation {
			releaseScheduledHeard();
			const used: string[] = [];
			const lines: string[] = [];
			for (const sense of spec.senses) {
				if (!hasChannel(channels, sense.id)) continue;
				let text: string | undefined;
				if (isBuiltInSense(sense)) {
					if (sense.kind === 'conversation') {
						const unheard = state.transcript.slice(state.heardCursor);
						state.heardCursor = state.transcript.length;
						text =
							unheard.length === 0
								? runtimeStrings.observation.nothingSaid
								: runtimeStrings.observation.heard(
										unheard.map((entry) => `${entry.speakerName}: ${entry.text}`)
									);
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

		function perform(call: ActionCall): ActionResult {
			// A turn is a turn, legal or not — both grid worlds' own clock discipline.
			state.tick += 1;
			const bare = bareOf(call.name);
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
				line('agent', runtimeStrings.agentName, parsed.data.text);
				return {
					ok: true,
					narration: runtimeStrings.narration.said(parsed.data.text),
					stateDiff: [{ path: 'transcript.length', from: seq - 1, to: seq }]
				};
			}
			const parsed = action.schema.safeParse(call.arguments ?? {});
			if (!parsed.success) return badArguments(action.id, parsed.error);
			const outcome = action.perform(state, parsed.data, context());
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

		return {
			snapshot(): WorldState {
				return structuredClone(state) as unknown as WorldState;
			},
			observe,
			perform,
			test(predicate): boolean {
				const check = spec.predicates[predicate];
				return check ? check.test(state) : false;
			},
			reset(): void {
				const rebuilt = buildState(layout, seed);
				state = rebuilt.state;
				truth = rebuilt.truth;
				random = seededRandom(seed ^ 0x9e3779b9);
				seq = 0;
			},
			// Present only when the case has a truth, so `'truth' in instance` is
			// honest for a desk that keeps nothing from the bot (the golden desk).
			...(built.truth !== undefined
				? { truth: (): unknown => (truth ? structuredClone(truth) : undefined) }
				: {}),
			receiveInput(text: string): void {
				line('counterpart', spec.counterpartName ?? runtimeStrings.counterpartName, text);
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
							line(
								'counterpart',
								spec.counterpartName ?? runtimeStrings.counterpartName,
								injection.text
							);
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
				}
			}
		};
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
		spec
	};
}
