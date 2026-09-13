import {
	canonicalJson,
	createPackRegistry,
	createSession,
	serviceLineToolId,
	sha256Hex,
	type ActionCall,
	type AnyAgentSpec,
	type BoundaryPoint,
	type BoundaryVerdict,
	type GuardrailContext,
	type ContextSpec,
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
	/**
	 * A stage's boundary chain, compiled by the host (`governance` is not a
	 * dependency here) for `stage-in` or `stage-out` (WP95, `69-…` §10):
	 * `stage.guards.components` at that point, and `policyCards` as
	 * `policy-card` components at `stage-in`. Absent, no boundary is guarded.
	 */
	boundaryGuardrailsFor?: (stage: StageSpec, point: BoundaryPoint) => Guardrail[];
	/** Guardrails every `agent` stage's session runs beside the bricks' (WP94): a stack compiled from components, appended after the stage's own cards. */
	guardrails?: Guardrail[];
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
	/** The run this one was handed off from (WP102): its chain is carried forward on `handoffs`. */
	handedOffFrom?: WorkflowRun;
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
/**
 * The cards the workflow's agent stages run under — one per stage whose
 * *effective* executor is a bot (WP85, `76-…` §3): a stage a person takes
 * by default and a bot takes in one configuration (the fraud SAR at Level
 * 5) has its card when that configuration runs.
 */
export function stagePack(
	spec: WorkflowSpec,
	layoutId: string,
	executors?: Record<string, Executor>
): PackManifest {
	const effective = (stage: StageSpec): Executor => executors?.[stage.id] ?? stage.executor;
	return {
		id: `workflow/${spec.id}`,
		name: `${spec.name} (stages)`,
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		goalCards: spec.stages
			.map((stage) => ({ stage, executor: effective(stage) }))
			.filter(
				(entry): entry is { stage: StageSpec; executor: Extract<Executor, { kind: 'agent' }> } =>
					entry.executor.kind === 'agent'
			)
			.map(({ stage, executor }) => ({
				id: stageCardId(spec.id, stage.id),
				title: stage.name,
				goalText: executor.goalText ?? `${spec.purpose} — ${stage.name}.`,
				worldId: spec.worldId,
				layoutId,
				successCondition: executor.until,
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
	if (config.stack !== undefined) record.stack = config.stack;
	if (config.stageStacks !== undefined) record.stageStacks = { ...config.stageStacks };
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
	// The world is created once, so its knobs and context are the origin's when re-running from a stage.
	const createConfig = origin ? worldConfigOf(origin.config) : config;
	const intake = spec.intake(item);

	const registry = createPackRegistry();
	for (const pack of options.packs) registry.registerPack(pack);
	registry.registerPack(stagePack(spec, intake.layoutId, config.executors));
	const definition = registry.getWorld(spec.worldId);
	if (!definition)
		throw new Error(`Workflow "${spec.id}" needs world "${spec.worldId}", which is not installed.`);
	// The config is handed over only when there is one, so a plain case is built exactly as a session builds it.
	const worldConfig = {
		...(intake.config ?? {}),
		...(createConfig.knobs ? { knobs: createConfig.knobs } : {}),
		// The rung of the context ladder (WP81, `70-…` §3), beside the knobs.
		...(createConfig.context ? { context: createConfig.context } : {})
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
	let handoff: WorkflowRun['handoff'];
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
		// A stage-out `stop-run` ends the journey after the stage's record is complete (§10).
		if (record.guards.verdicts?.some((verdict) => verdict.verdict === 'stop-run')) {
			outcome = 'stopped';
			break;
		}
		const output = record.output.value;
		const next = stage.next(output, world.snapshot(), input);
		// A handoff (WP102, `83-…` §6.5.3): the journey ends here; the host starts the target with the item.
		if (typeof next === 'object') {
			handoff = { to: next.handoff, itemId: next.item.id, item: next.item };
			outcome = 'handed-off';
			break;
		}
		current = next;
		input = output;
	}
	const handoffs = options.handedOffFrom
		? [
				...(options.handedOffFrom.handoffs ?? []),
				{
					runId: options.handedOffFrom.id,
					workflowId: options.handedOffFrom.workflowId,
					itemId: options.handedOffFrom.itemId
				}
			]
		: undefined;

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
		...(handoff ? { handoff } : {}),
		...(handoffs ? { handoffs } : {}),
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
		const noBoundary: BoundaryFold = { checked: 0, verdicts: [] };
		if (inputProblems.length > 0) {
			const base: Base = {
				stageId: stage.id,
				executor: executorRecord(executor),
				input: stageValue(stageInput),
				stage,
				rawInput: stageInput,
				inbound: noBoundary
			};
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
		// The stage-in chain over the validated input (§10): written on the workflow's events before the stage starts.
		const inbound = await boundary(stage, 'stage-in', stageInput, undefined, events, emit);
		const base: Base = {
			stageId: stage.id,
			executor: executorRecord(executor),
			input: stageValue(stageInput),
			stage,
			rawInput: stageInput,
			inbound: inbound.fold
		};
		if (inbound.kind !== 'continue') {
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
				'blocked',
				inbound.finding,
				0
			);
		}
		const effectiveInput = inbound.value;
		switch (executor.kind) {
			case 'agent':
				return agentStage(stage, executor, effectiveInput, base, started);
			case 'rule':
				return ruleStage(stage, executor, effectiveInput, base, started);
			case 'human':
				return humanStage(stage, executor, effectiveInput, base, started);
			case 'line':
				return lineStage(stage, executor, effectiveInput, base, started);
		}
	}

	type Base = Pick<StageRecord, 'stageId' | 'executor' | 'input'> & {
		stage: StageSpec;
		rawInput: unknown;
		inbound: BoundaryFold;
	};
	type Tripped = StageRecord['guards']['tripped'];
	type Write = <T extends EventType>(type: T, payload: PayloadFor<T>) => void;
	type BoundaryFold = { checked: number; verdicts: BoundaryVerdict[] };
	type BoundaryResult =
		| { kind: 'continue'; value: unknown; fold: BoundaryFold }
		| { kind: 'blocked' | 'stopped'; finding: string; fold: BoundaryFold };

	/**
	 * **The boundary chain** (WP95, `69-…` §10; `83-…` §6.2.3, D11): the host's
	 * compiled guardrails for the point, each checked once over the stage's
	 * value framed as a proposed action named for the stage, first non-allow
	 * wins. `block-action` and `stop-run` halt with the reason as the finding;
	 * `pause` asks the host as a `human` stage would and a decline halts;
	 * `redact` rewrites the value the next reader sees; `annotate` and a plain
	 * allow are recorded. Every check is a `guardrail.checked` on the events
	 * given, with the point and the stage on it; a `hooks` list is not
	 * consulted here — the point is the hook at a boundary.
	 */
	async function boundary(
		stage: StageSpec,
		point: BoundaryPoint,
		stageInput: unknown,
		output: unknown,
		history: readonly EngineEvent[],
		write: Write
	): Promise<BoundaryResult> {
		const chain = options.boundaryGuardrailsFor?.(stage, point) ?? [];
		const fold: BoundaryFold = { checked: 0, verdicts: [] };
		let value = point === 'stage-in' ? stageInput : output;
		if (chain.length === 0) return { kind: 'continue', value, fold };
		const hook = point === 'stage-in' ? 'pre-act' : 'post-act';
		for (const guardrail of chain) {
			const proposed = { kind: 'action' as const, name: stage.id, arguments: value };
			const context: GuardrailContext = {
				hook,
				tick: ordinal,
				spec: options.spec,
				usage: { ticks: ordinal, inputTokens: 0, outputTokens: 0 },
				proposed,
				worldState: world.snapshot(),
				history,
				stage: {
					id: stage.id,
					point,
					input: stageInput,
					...(point === 'stage-out' ? { output: value } : {})
				}
			};
			const checked = guardrail.checkWithRecord
				? await guardrail.checkWithRecord(context)
				: { verdict: await guardrail.check(context) };
			const verdict = checked.verdict;
			const stamps = {
				...(guardrail.policyCardId ? { policyCardId: guardrail.policyCardId } : {}),
				...(guardrail.componentId ? { componentId: guardrail.componentId } : {}),
				point: { kind: point, at: stage.id }
			};
			if (checked.external) {
				write('guardrail.external', { guardrailId: guardrail.id, hook, ...checked.external });
			}
			write('guardrail.checked', { guardrailId: guardrail.id, hook, verdict, ...stamps });
			fold.checked += 1;
			const kind: BoundaryVerdict['verdict'] =
				'pause' in verdict
					? 'pause'
					: verdict.allow
						? (verdict.verdictKind ?? 'allow')
						: verdict.disposition;
			const entry: BoundaryVerdict = {
				guardrailId: guardrail.id,
				point,
				verdict: kind,
				...(guardrail.componentId ? { componentId: guardrail.componentId } : {}),
				...(guardrail.policyCardId ? { policyCardId: guardrail.policyCardId } : {}),
				...('reason' in verdict
					? { reason: verdict.reason }
					: verdict.note !== undefined
						? { reason: verdict.note }
						: {})
			};
			if ('pause' in verdict) {
				write('approval.requested', { proposed, reason: verdict.reason });
				const approved = options.approve ? options.approve(stage, proposed) : true;
				write('approval.resolved', {
					approved,
					...(options.principal ? { by: options.principal } : {})
				});
				fold.verdicts.push({ ...entry, approved });
				if (!approved) {
					return { kind: 'blocked', finding: `declined at ${point}: ${verdict.reason}`, fold };
				}
				continue;
			}
			fold.verdicts.push(entry);
			if (!verdict.allow) {
				write('guardrail.tripped', {
					guardrailId: guardrail.id,
					hook,
					reason: verdict.reason,
					disposition: verdict.disposition,
					...(verdict.cause !== undefined ? { cause: verdict.cause } : {}),
					...stamps
				});
				return {
					kind: verdict.disposition === 'stop-run' ? 'stopped' : 'blocked',
					finding: verdict.reason,
					fold
				};
			}
			if (verdict.verdictKind === 'redact' && verdict.redactedText !== undefined) {
				value = redactInto(value, verdict.redactedText);
			}
		}
		return { kind: 'continue', value, fold };
	}

	async function finishStage(
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
		bus?: Write,
		/** The trace a stage-out guard reads — an agent stage's own run; else the workflow's events. */
		history?: readonly EngineEvent[]
	): Promise<StageRecord> {
		const { stage, rawInput, inbound, ...recordBase } = base;
		const write: Write = bus ?? ((type, payload) => emit(type, payload));
		const fold: BoundaryFold = { checked: inbound.checked, verdicts: [...inbound.verdicts] };
		let value = output;
		let finalStatus = status;
		let finalFinding = finding;
		// The stage-out chain over the validated output (§10), before the next stage reads it.
		if ((status === 'ok' || status === 'escalated') && output !== undefined) {
			const outbound = await boundary(
				stage,
				'stage-out',
				rawInput,
				output,
				history ?? events,
				write
			);
			fold.checked += outbound.fold.checked;
			fold.verdicts.push(...outbound.fold.verdicts);
			if (outbound.kind === 'continue') value = outbound.value;
			else {
				finalStatus = 'blocked';
				finalFinding = outbound.finding;
			}
		}
		const ended = now();
		const out = stageValue(value === undefined ? null : value);
		const guards: StageRecord['guards'] = {
			checked: checked + fold.checked,
			tripped,
			...(fold.verdicts.length > 0 ? { verdicts: fold.verdicts } : {})
		};
		const record: StageRecord = {
			...recordBase,
			startedTick,
			endedTick,
			durationMs: Math.max(0, Date.parse(ended) - Date.parse(started)),
			output: out,
			guards,
			...extra,
			status: finalStatus,
			...(finalFinding !== undefined ? { finding: finalFinding } : {})
		};
		write('stage.completed', {
			workflowRunId: runId,
			stageId: base.stageId,
			output: out,
			status: finalStatus,
			guards: {
				checked: guards.checked,
				tripped: tripped.length,
				...(fold.verdicts.length > 0 ? { verdicts: fold.verdicts } : {})
			}
		});
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
		// The stage's own guards run at its boundaries (§10); the loop carries the host's shared chain alone.
		const shared = options.guardrails ?? [];
		const guardrails = shared.length > 0 ? shared : undefined;
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
		const record = await finishStage(
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
			(type, payload) => onBus(type, payload, lastTick),
			trace
		);
		options.onAgentRun?.({
			runId: session.runId,
			stageId: stage.id,
			spec: session.spec,
			events: trace
		});
		return record;
	}

	async function ruleStage(
		stage: StageSpec,
		executor: Extract<Executor, { kind: 'rule' }>,
		stageInput: unknown,
		base: Base,
		started: string
	): Promise<StageRecord> {
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

/**
 * A `redact` verdict applied to a stage value (WP95; WP96 widens it to the
 * transcript): a string is replaced whole; an object with a string `text`
 * has that replaced; anything else is left as it was, the verdict on the
 * record saying what the guard would have written.
 */
function redactInto(value: unknown, redactedText: string): unknown {
	if (typeof value === 'string') return redactedText;
	if (
		value &&
		typeof value === 'object' &&
		typeof (value as { text?: unknown }).text === 'string'
	) {
		return { ...(value as Record<string, unknown>), text: redactedText };
	}
	return value;
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

function worldConfigOf(config: WorkflowRun['config']): WorkflowConfig {
	return {
		...(config.knobs ? { knobs: { ...config.knobs } } : {}),
		// The record's context is the spec as data; `undefined` keys are what the parse leaves, never written.
		...(config.context ? { context: config.context as ContextSpec } : {})
	};
}

/** The pack a qualified content id belongs to — everything before its last slash. */
function packOf(_registry: PackRegistry, id: string): string {
	const lastSlash = id.lastIndexOf('/');
	return lastSlash === -1 ? id : id.slice(0, lastSlash);
}

export type { WorkflowRun, WorkflowSpec, WorkflowConfig, StageRecord } from '@craftabot/core';
export type { WorldInstance };

/**
 * **Following a handoff** (WP102, `83-…` §6.5.3): the target journey run
 * with the item the finished run handed over, under the same host options
 * (packs, bot, brains, clocks) and its chain carried forward. Returns the
 * run, or nothing when there was no handoff; a host loops on it to follow a
 * chain to its end.
 */
export async function followHandoff(
	run: WorkflowRun,
	registry: Pick<PackRegistry, 'getWorkflow'>,
	options: Omit<RunWorkflowOptions, 'fromStage' | 'handedOffFrom'>
): Promise<WorkflowRun | undefined> {
	if (!run.handoff) return undefined;
	const target = registry.getWorkflow(run.handoff.to);
	if (!target)
		throw new Error(`run ${run.id} hands off to "${run.handoff.to}", which is not installed`);
	return runWorkflow(target, run.handoff.item, { ...options, handedOffFrom: run });
}
