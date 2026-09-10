import {
	canonicalJson,
	createPackRegistry,
	createSession,
	serviceLineToolId,
	sha256Hex,
	type ActionCall,
	type AnyAgentSpec,
	type EgressMode,
	type EngineEvent,
	type EventType,
	type Executor,
	type ExecutorRecord,
	type Guardrail,
	type LLMProvider,
	type PackManifest,
	type PackRegistry,
	type Principal,
	type RunOutcome,
	type SessionOptions,
	type StageRecord,
	type StageSpec,
	type WorkItem,
	type WorkflowConfig,
	type WorkflowRun,
	type WorkflowSpec,
	type WorldInstance,
	type WorldState
} from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import { validateAgainst } from './validate.js';

/**
 * **The workflow runtime** (WP79, `69-WORKFLOWS.md` §5; `64-…` §6.2, tenet
 * 21): one `WorldInstance` created once from the work item's intake and
 * carried across the stages; each stage validates its input, runs its
 * executor — a rule, the bot on a card synthesised for the stage, a person
 * through the host's resolver, a service line's tool — reads its output,
 * validates it, records, and asks `next` where to go. The record is a
 * `WorkflowRun` with a digest over its stage records.
 */
export interface RunWorkflowOptions {
	/** The configuration this run is; absent, the spec's defaults. */
	config?: WorkflowConfig;
	/** The packs the registry is built from — the workflow's world, service lines, brick kinds, cartridges. */
	packs: PackManifest[];
	/** The bot every `agent` stage seats, its `goalCardId` replaced by the stage's card. */
	spec: AnyAgentSpec;
	providerFor: (stage: StageSpec, goalCardId: string) => LLMProvider;
	/** The stage's guards, compiled by the host (`governance` is not a dependency here). */
	guardrailsFor?: (policyCardIds: string[]) => Guardrail[];
	/** The person at a `human` stage; absent, the executor's `default`, else its first option, `by` absent. */
	human?: (
		stage: StageSpec,
		state: WorldState,
		executor: Extract<Executor, { kind: 'human' }>,
		/** The stage's `suggest` — what a scripted person would answer — when the spec has one. */
		suggested: string | undefined
	) => Promise<HumanDecision> | HumanDecision;
	/** How an agent stage's approval pauses are answered; absent, approved. */
	approve?: (
		stage: StageSpec,
		proposed: { kind: 'tool' | 'action'; name: string; arguments: unknown }
	) => boolean;
	principal?: Principal;
	egress?: EgressMode;
	getCredential?: (id: string) => string | undefined;
	/** The workflow's own clock, id source and stream (its events, its run id, the world's seed). */
	now?: () => string;
	newId?: () => string;
	seed?: number;
	random?: () => number;
	/**
	 * Every agent stage's session options — its own clock and id source, so an
	 * agent's trace is the trace a session alone would write (§9). The world is
	 * created with `session.random` when given, so the same seed builds the same case.
	 */
	session?: SessionOptions;
	/** Re-run from a stage: the stages before it under the origin's config and seeds, the new config from there (§5 item 4). */
	fromStage?: { stageId: string; from: WorkflowRun };
	/** The bound on a cyclic journey. */
	maxStages?: number;
	onStage?: (record: StageRecord) => void;
	/** The world as the journey left it — its truth for a campaign's scoring — once the record is made. */
	onFinished?: (world: WorldInstance, run: WorkflowRun) => void;
	/** Every agent run the workflow made, with its events, as it ends — the host writes the traces. */
	onAgentRun?: (run: {
		runId: string;
		stageId: string;
		spec: AnyAgentSpec;
		events: EngineEvent[];
	}) => void;
	/** The population the item came from, on the record when the host knows it. */
	populationDigest?: string;
}

export interface HumanDecision {
	decision: string;
	by?: Principal;
}

/** A value is kept on the record when its canonical JSON is under this; else the digest alone (§4). */
export const VALUE_CAP = 16 * 1024;

type PayloadFor<T extends EventType> = Extract<EngineEvent, { type: T }>['payload'];

export function stageCardId(workflowId: string, stageId: string): string {
	return `${workflowId}/stage/${stageId}`;
}

/** The synthetic pack carrying one goal card per agent stage (§5 item 1). */
export function stagePack(spec: WorkflowSpec, layoutId: string): PackManifest {
	return {
		id: `workflow/${spec.id}`,
		name: `${spec.name} (stages)`,
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		goalCards: spec.stages
			.filter((stage) => stage.executor.kind === 'agent')
			.map((stage) => ({
				id: stageCardId(spec.id, stage.id),
				title: stage.name,
				goalText:
					(stage.executor as Extract<Executor, { kind: 'agent' }>).goalText ??
					`${spec.purpose} — ${stage.name}.`,
				worldId: spec.worldId,
				layoutId,
				successCondition: (stage.executor as Extract<Executor, { kind: 'agent' }>).until,
				hints: [],
				teachesConcepts: [],
				par: 5
			}))
	};
}

export function stageValue(value: unknown): { digest: string; value?: unknown } {
	const json = canonicalJson(value);
	const digest = sha256Hex(json);
	return json.length < VALUE_CAP ? { digest, value } : { digest };
}

export function executorRecord(executor: Executor): ExecutorRecord {
	switch (executor.kind) {
		case 'rule':
			return { kind: 'rule', rule: executor.rule };
		case 'agent':
			return {
				kind: 'agent',
				until: executor.until,
				...(executor.maxTicks !== undefined ? { maxTicks: executor.maxTicks } : {}),
				...(executor.goalText !== undefined ? { goalText: executor.goalText } : {})
			};
		case 'human':
			return {
				kind: 'human',
				prompt: executor.prompt,
				options: [...executor.options],
				...(executor.default !== undefined ? { default: executor.default } : {})
			};
		case 'line':
			return { kind: 'line', lineId: executor.lineId, operation: executor.operation };
	}
}

/** The config as data — functions (a `line` executor's `arguments`) left off. */
export function configRecord(config: WorkflowConfig): WorkflowRun['config'] {
	const record: WorkflowRun['config'] = {};
	if (config.executors) {
		record.executors = Object.fromEntries(
			Object.entries(config.executors).map(([id, executor]) => [id, executorRecord(executor)])
		);
	}
	if (config.knobs) record.knobs = { ...config.knobs };
	if (config.autonomy) {
		record.autonomy = {
			level: config.autonomy.level,
			...(config.autonomy.ceilings ? { ceilings: { ...config.autonomy.ceilings } } : {})
		};
	}
	if (config.context !== undefined) record.context = config.context;
	return record;
}

function defaultNewId(): () => string {
	let counter = 0;
	return () => {
		counter += 1;
		const hex = counter.toString(16).padStart(12, '0');
		return `00000000-0000-4000-8000-${hex}`;
	};
}

export async function runWorkflow(
	spec: WorkflowSpec,
	item: WorkItem,
	options: RunWorkflowOptions
): Promise<WorkflowRun> {
	const now = options.now ?? (() => new Date().toISOString());
	const newId = options.newId ?? defaultNewId();
	const random = options.random ?? seededRandom(options.seed ?? 1);
	const worldRandom = options.session?.random ?? random;
	const config = options.config ?? {};
	const origin = options.fromStage?.from;
	// The world is created once, so its knobs are the origin's when re-running from a stage.
	const createConfig = origin ? knobsOf(origin.config) : config;
	const intake = spec.intake(item);

	const registry = createPackRegistry();
	for (const pack of options.packs) registry.registerPack(pack);
	registry.registerPack(stagePack(spec, intake.layoutId));
	const definition = registry.getWorld(spec.worldId);
	if (!definition)
		throw new Error(`Workflow "${spec.id}" needs world "${spec.worldId}", which is not installed.`);
	// The config is handed over only when there is one, so a plain case is built exactly as a session builds it.
	const worldConfig = {
		...(intake.config ?? {}),
		...(createConfig.knobs ? { knobs: createConfig.knobs } : {})
	};
	const world = definition.create(intake.layoutId, {
		random: worldRandom,
		...(Object.keys(worldConfig).length > 0 ? { config: worldConfig } : {})
	});

	const runId = newId();
	const startedAt = now();
	const events: EngineEvent[] = [];
	const stages: StageRecord[] = [];
	const runIds: string[] = [];
	let ordinal = 0;
	let reached = options.fromStage === undefined;

	function emit<T extends EventType>(type: T, payload: PayloadFor<T>): void {
		events.push({
			id: newId(),
			runId,
			agentId: options.spec.id,
			tick: ordinal,
			timestamp: now(),
			type,
			payload
		} as EngineEvent);
	}

	const byId = new Map(spec.stages.map((stage) => [stage.id, stage]));
	let current: string | 'end' = spec.first;
	let input: unknown = intake.input;
	let outcome: WorkflowRun['outcome'] = 'completed';
	const maxStages = options.maxStages ?? 64;

	while (current !== 'end') {
		if (ordinal >= maxStages) {
			outcome = 'stopped';
			break;
		}
		const stage = byId.get(current);
		if (!stage) throw new Error(`Workflow "${spec.id}" has no stage "${current}".`);
		if (options.fromStage && stage.id === options.fromStage.stageId) reached = true;
		const executor =
			(reached || !origin
				? config.executors?.[stage.id]
				: executorFrom(origin.config.executors?.[stage.id])) ?? stage.executor;
		ordinal += 1;

		const record = await runStage(stage, executor, input);
		stages.push(record);
		options.onStage?.(record);
		if (record.status === 'error' || record.status === 'blocked') {
			outcome = 'stopped';
			break;
		}
		const output = record.output.value;
		current = stage.next(output, world.snapshot(), input);
		input = output;
	}

	const finishedAt = now();
	const record: WorkflowRun = {
		schemaVersion: 1,
		id: runId,
		workflowId: spec.id,
		itemId: item.id,
		...(options.populationDigest !== undefined
			? { populationDigest: options.populationDigest }
			: {}),
		config: configRecord(config),
		startedAt,
		finishedAt,
		outcome,
		stages,
		runIds,
		events,
		digest: sha256Hex(canonicalJson(stages))
	};
	options.onFinished?.(world, record);
	return record;

	async function runStage(
		stage: StageSpec,
		executor: Executor,
		stageInput: unknown
	): Promise<StageRecord> {
		const started = now();
		const inputProblems = validateAgainst(stage.input, stageInput);
		const base = {
			stageId: stage.id,
			executor: executorRecord(executor),
			input: stageValue(stageInput)
		};
		if (inputProblems.length > 0) {
			emit('stage.started', {
				workflowRunId: runId,
				stageId: stage.id,
				executor: executor.kind,
				input: base.input
			});
			return finishStage(
				base,
				started,
				ordinal,
				ordinal,
				undefined,
				[],
				'error',
				`input rejected: ${inputProblems.join('; ')}`,
				0
			);
		}
		switch (executor.kind) {
			case 'agent':
				return agentStage(stage, executor, stageInput, base, started);
			case 'rule':
				return ruleStage(stage, executor, stageInput, base, started);
			case 'human':
				return humanStage(stage, executor, stageInput, base, started);
			case 'line':
				return lineStage(stage, executor, stageInput, base, started);
		}
	}

	type Base = Pick<StageRecord, 'stageId' | 'executor' | 'input'>;
	type Tripped = StageRecord['guards']['tripped'];

	function finishStage(
		base: Base,
		started: string,
		startedTick: number,
		endedTick: number,
		output: unknown,
		tripped: Tripped,
		status: StageRecord['status'],
		finding: string | undefined,
		checked: number,
		extra: Partial<Pick<StageRecord, 'runId' | 'approval'>> = {},
		bus?: (type: 'stage.completed', payload: PayloadFor<'stage.completed'>) => void
	): StageRecord {
		const ended = now();
		const out = stageValue(output === undefined ? null : output);
		const record: StageRecord = {
			...base,
			startedTick,
			endedTick,
			durationMs: Math.max(0, Date.parse(ended) - Date.parse(started)),
			output: out,
			guards: { checked, tripped },
			...extra,
			status,
			...(finding !== undefined ? { finding } : {})
		};
		const payload = {
			workflowRunId: runId,
			stageId: base.stageId,
			output: out,
			status,
			guards: { checked, tripped: tripped.length }
		};
		if (bus) bus('stage.completed', payload);
		else emit('stage.completed', payload);
		return record;
	}

	/**
	 * The output read and checked; `undefined` means the stage is an error with
	 * the finding given. `read` applies to an agent's and a line's work on the
	 * world; a rule and a person return their own (§3).
	 */
	function readOutput(
		stage: StageSpec,
		fromExecutor: unknown,
		useRead = true
	): { output: unknown } | { finding: string } {
		const output =
			useRead && stage.read ? stage.read(world.snapshot(), world.truth?.()) : fromExecutor;
		if (output === undefined) return { finding: 'the stage ended without producing its output' };
		const problems = validateAgainst(stage.output, output);
		if (problems.length > 0) return { finding: `output rejected: ${problems.join('; ')}` };
		return { output };
	}

	async function agentStage(
		stage: StageSpec,
		executor: Extract<Executor, { kind: 'agent' }>,
		stageInput: unknown,
		base: Base,
		started: string
	): Promise<StageRecord> {
		const goalCardId = stageCardId(spec.id, stage.id);
		const cards = stage.guards?.policyCards ?? [];
		const guardrails = cards.length > 0 ? options.guardrailsFor?.(cards) : undefined;
		const sessionOptions: SessionOptions = {
			...(options.session ?? {}),
			...(options.principal && !options.session?.principal ? { principal: options.principal } : {}),
			...(options.egress && !options.session?.egress ? { egress: options.egress } : {}),
			...(executor.maxTicks !== undefined
				? { budgets: { ...(options.session?.budgets ?? {}), maxTicks: executor.maxTicks } }
				: {})
		};
		const session = createSession({
			spec: { ...options.spec, goalCardId } as AnyAgentSpec,
			registry,
			provider: options.providerFor(stage, goalCardId),
			world,
			...(guardrails ? { guardrails } : {}),
			...(options.getCredential ? { getCredential: options.getCredential } : {}),
			options: sessionOptions
		});
		const trace: EngineEvent[] = [];
		let checked = 0;
		const tripped: Tripped = [];
		let lastTick = 0;
		session.events.onAny((event) => {
			trace.push(event);
			if (event.tick > lastTick) lastTick = event.tick;
			if (event.type === 'guardrail.checked' || event.type === 'guardrail.external') checked += 1;
			if (event.type === 'guardrail.tripped') {
				tripped.push({
					guardrailId: event.payload.guardrailId,
					disposition: event.payload.disposition ?? 'observed',
					...(event.payload.cause !== undefined ? { cause: event.payload.cause } : {})
				});
			}
		});
		session.events.on('approval.requested', (event) => {
			const approved = options.approve ? options.approve(stage, event.payload.proposed) : true;
			session.resolveApproval(approved, options.principal);
		});
		// The workflow's own clock and id source stamp its stage events wherever they are written, so the session's ids run exactly as they would alone (§9).
		const onBus = <T extends EventType>(type: T, payload: PayloadFor<T>, tick: number) => {
			session.events.emit({
				id: newId(),
				runId: session.runId,
				agentId: options.spec.id,
				tick,
				timestamp: now(),
				type,
				payload
			} as EngineEvent);
		};
		onBus(
			'stage.started',
			{ workflowRunId: runId, stageId: stage.id, executor: 'agent', input: base.input },
			0
		);
		session.start('step');
		let result: RunOutcome | undefined;
		const limit = (executor.maxTicks ?? 30) + 10;
		for (let step = 0; step < limit && result === undefined; step++) {
			const tick = await session.step();
			if (tick.outcome) result = tick.outcome;
		}
		if (result === undefined) {
			session.stop('the workflow gave up');
			result = 'STOPPED_BY_USER';
		}
		runIds.push(session.runId);
		const read = result === 'SUCCESS' ? readOutput(stage, undefined) : undefined;
		const status: StageRecord['status'] =
			result === 'STOPPED_BY_GUARDRAIL' ? 'blocked' : read && 'output' in read ? 'ok' : 'error';
		const finding =
			status === 'ok'
				? undefined
				: status === 'blocked'
					? 'a guardrail stopped the run'
					: read && 'finding' in read
						? read.finding
						: `the run ended ${result}`;
		const record = finishStage(
			base,
			started,
			0,
			lastTick,
			read && 'output' in read ? read.output : undefined,
			tripped,
			status,
			finding,
			checked,
			{ runId: session.runId },
			(type, payload) => onBus(type, payload, lastTick)
		);
		options.onAgentRun?.({
			runId: session.runId,
			stageId: stage.id,
			spec: session.spec,
			events: trace
		});
		return record;
	}

	function ruleStage(
		stage: StageSpec,
		executor: Extract<Executor, { kind: 'rule' }>,
		stageInput: unknown,
		base: Base,
		started: string
	): StageRecord {
		emit('stage.started', {
			workflowRunId: runId,
			stageId: stage.id,
			executor: 'rule',
			input: base.input
		});
		const rule = spec.rules?.[executor.rule];
		if (!rule) {
			return finishStage(
				base,
				started,
				ordinal,
				ordinal,
				undefined,
				[],
				'error',
				`no rule "${executor.rule}"`,
				0
			);
		}
		const { output, call } = rule(stageInput, world.snapshot(), world.truth?.());
		let finding: string | undefined;
		if (call) {
			const result = perform(call);
			if (!result.ok) finding = `the world refused ${call.name}: ${result.narration}`;
		}
		if (finding !== undefined) {
			return finishStage(base, started, ordinal, ordinal, undefined, [], 'error', finding, 0);
		}
		const read = readOutput(stage, output, false);
		return 'output' in read
			? finishStage(base, started, ordinal, ordinal, read.output, [], 'ok', undefined, 0)
			: finishStage(base, started, ordinal, ordinal, undefined, [], 'error', read.finding, 0);
	}

	function perform(call: ActionCall) {
		const result = world.perform(call);
		emit('action.performed', {
			name: call.name,
			arguments: call.arguments,
			result: {
				ok: result.ok,
				narration: result.narration,
				...(result.stateDiff !== undefined ? { stateDiff: result.stateDiff } : {})
			}
		});
		return result;
	}

	async function humanStage(
		stage: StageSpec,
		executor: Extract<Executor, { kind: 'human' }>,
		stageInput: unknown,
		base: Base,
		started: string
	): Promise<StageRecord> {
		emit('stage.started', {
			workflowRunId: runId,
			stageId: stage.id,
			executor: 'human',
			input: base.input
		});
		const proposed = { kind: 'action' as const, name: stage.id, arguments: stageInput };
		emit('approval.requested', { proposed, reason: executor.prompt });
		const state = world.snapshot();
		const suggested = stage.suggest?.(stageInput, state, world.truth?.());
		const answer: HumanDecision = options.human
			? await options.human(stage, state, executor, suggested)
			: { decision: suggested ?? executor.default ?? executor.options[0] ?? '' };
		const first = executor.options[0];
		if (!executor.options.includes(answer.decision)) {
			emit('approval.resolved', { approved: false, ...(answer.by ? { by: answer.by } : {}) });
			return finishStage(
				base,
				started,
				ordinal,
				ordinal,
				undefined,
				[],
				'error',
				`"${answer.decision}" is not one of the stage's options`,
				0,
				{
					approval: {
						requested: true,
						...(answer.by ? { by: answer.by } : {}),
						decision: answer.decision
					}
				}
			);
		}
		emit('approval.resolved', {
			approved: answer.decision === first,
			...(answer.by ? { by: answer.by } : {})
		});
		const read = readOutput(stage, { decision: answer.decision }, false);
		const approval = {
			requested: true as const,
			...(answer.by ? { by: answer.by } : {}),
			decision: answer.decision
		};
		if ('finding' in read) {
			return finishStage(base, started, ordinal, ordinal, undefined, [], 'error', read.finding, 0, {
				approval
			});
		}
		return finishStage(
			base,
			started,
			ordinal,
			ordinal,
			read.output,
			[],
			answer.decision === first ? 'ok' : 'escalated',
			undefined,
			0,
			{ approval }
		);
	}

	async function lineStage(
		stage: StageSpec,
		executor: Extract<Executor, { kind: 'line' }>,
		stageInput: unknown,
		base: Base,
		started: string
	): Promise<StageRecord> {
		emit('stage.started', {
			workflowRunId: runId,
			stageId: stage.id,
			executor: 'line',
			input: base.input
		});
		const line = registry.getServiceLine(executor.lineId);
		const packId = line ? packOf(registry, executor.lineId) : undefined;
		const tool =
			packId !== undefined
				? registry.getTool(serviceLineToolId(packId, executor.lineId, executor.operation))
				: undefined;
		if (!tool) {
			return finishStage(
				base,
				started,
				ordinal,
				ordinal,
				undefined,
				[],
				'error',
				`no tool for ${executor.lineId} ${executor.operation}`,
				0
			);
		}
		const state = world.snapshot();
		const args = executor.arguments ? executor.arguments(stageInput, state) : stageInput;
		const before = now();
		const notes: string[] = [];
		const result = await tool.execute(args, {
			tick: ordinal,
			notebook: { read: () => [...notes], append: (line) => void notes.push(line) },
			random,
			worldState: state
		});
		emit('tool.executed', {
			name: tool.id,
			arguments: args,
			result: result.output,
			...(result.data !== undefined ? { data: result.data } : {}),
			durationMs: Math.max(0, Date.parse(now()) - Date.parse(before))
		});
		if (!result.ok) {
			return finishStage(
				base,
				started,
				ordinal,
				ordinal,
				undefined,
				[],
				'error',
				`the line answered ${result.errorKind ?? 'error'}: ${result.output}`,
				0
			);
		}
		const read = readOutput(stage, result.data ?? { output: result.output });
		return 'output' in read
			? finishStage(base, started, ordinal, ordinal, read.output, [], 'ok', undefined, 0)
			: finishStage(base, started, ordinal, ordinal, undefined, [], 'error', read.finding, 0);
	}
}

/** An executor read back off a record — the same shape, `undefined` keys dropped. */
function executorFrom(record: ExecutorRecord | undefined): Executor | undefined {
	if (!record) return undefined;
	switch (record.kind) {
		case 'rule':
			return { kind: 'rule', rule: record.rule };
		case 'agent':
			return {
				kind: 'agent',
				until: record.until,
				...(record.maxTicks !== undefined ? { maxTicks: record.maxTicks } : {}),
				...(record.goalText !== undefined ? { goalText: record.goalText } : {})
			};
		case 'human':
			return {
				kind: 'human',
				prompt: record.prompt,
				options: [...record.options],
				...(record.default !== undefined ? { default: record.default } : {})
			};
		case 'line':
			return { kind: 'line', lineId: record.lineId, operation: record.operation };
	}
}

function knobsOf(config: WorkflowRun['config']): WorkflowConfig {
	return config.knobs ? { knobs: { ...config.knobs } } : {};
}

/** The pack a qualified content id belongs to — everything before its last slash. */
function packOf(_registry: PackRegistry, id: string): string {
	const lastSlash = id.lastIndexOf('/');
	return lastSlash === -1 ? id : id.slice(0, lastSlash);
}

export type { WorkflowRun, WorkflowSpec, WorkflowConfig, StageRecord } from '@craftabot/core';
export type { WorldInstance };
