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
	type Reader,
	type ToolResult,
	type ReaderRecord,
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
import {
	recommendationIn,
	resolveReviewer,
	createApprover,
	namesPersonRates,
	personAtStage,
	ratesOf,
	reviewerAnswerDrawn,
	reviewerRandom
} from './reviewer.js';
import { checkedAnswers, readGate, readerRecordOf, resolveReader } from './reader.js';

/**
 * **The workflow runtime** (WP79, `69-WORKFLOWS.md` §5; `64-…` §6.2, tenet
 * 21): one `WorldInstance` created once from the work item's intake and
 * carried across the stages; each stage validates its input, runs its
 * executor — a rule, the bot on a card synthesised for the stage, a person
 * through the host's resolver, a service line's tool — reads its output,
 * validates it, records, and asks `next` where to go. The record is a
 * `WorkflowRun` with a digest over its stage records.
 */
/** The guardrail id the enforced ceiling writes on the record (WP139). */
export const CEILING_GUARDRAIL_ID = 'workflow/ceiling';

export interface RunWorkflowOptions {
	/** The configuration this run is; absent, the spec's defaults. */
	config?: WorkflowConfig;
	/** The packs the registry is built from — the workflow's world, service lines, brick kinds, cartridges. */
	packs: PackManifest[];
	/** The bot every `agent` stage seats, its `goalCardId` replaced by the stage's card. */
	spec: AnyAgentSpec;
	/**
	 * The bot for a journey on this world (WP112, `90-…` §7's one-spec-per-run
	 * seam): asked with the workflow's `worldId` as the run starts, and used in
	 * place of `spec` when it answers. `followHandoff` passes it on, so a
	 * handoff onto another desk seats a bot that hears and acts on that desk —
	 * `specOnWorld` re-points a bot's Sense and Actions bricks for it.
	 */
	specFor?: (worldId: string) => AnyAgentSpec | undefined;
	providerFor: (stage: StageSpec, goalCardId: string) => LLMProvider;
	/**
	 * The provider an `llm` reader asks when it carries none of its own (WP120,
	 * `104-READERS.md` §10.1): the host's, by the reader. Absent, such a reader
	 * fails its stage.
	 */
	readerProvider?: (reader: Reader) => LLMProvider | undefined;
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
	/** The largest value a stage record keeps, in bytes of canonical JSON (WP148); `VALUE_CAP` by default. Over it, the digest alone. */
	valueCap?: number;
	/**
	 * A stage value over the cap, whole (WP160, `112-REAL-ENOUGH-PLAN.md` §5): the record keeps its digest alone, and a host that wants to read the value later (a story) keeps it here, under that digest. Called once per over-cap input or output.
	 */
	onValue?: (value: {
		digest: string;
		value: unknown;
		stageId: string;
		role: 'input' | 'output';
	}) => void;
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
	/** Why, when the decision overrules what the case recommended (WP146); recorded on the approval. */
	reason?: string;
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

export function stageValue(
	value: unknown,
	cap: number = VALUE_CAP
): { digest: string; value?: unknown } {
	const json = canonicalJson(value);
	const digest = sha256Hex(json);
	return json.length < cap ? { digest, value } : { digest };
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
		case 'reader':
			return {
				kind: 'reader',
				readerId: executor.readerId,
				...(executor.questionSet !== undefined ? { questionSet: executor.questionSet } : {}),
				...(executor.gate
					? {
							gate: {
								threshold: executor.gate.threshold,
								else: executorRecord(executor.gate.else) as Extract<
									ExecutorRecord,
									{ kind: 'rule' | 'human' }
								>,
								...(executor.gate.steer !== undefined ? { steer: executor.gate.steer } : {})
							}
						}
					: {})
			};
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
			...(config.autonomy.ceilings ? { ceilings: { ...config.autonomy.ceilings } } : {}),
			...(config.autonomy.enforce === true ? { enforce: true as const } : {})
		};
	}
	if (config.context !== undefined) record.context = config.context;
	if (config.stack !== undefined) record.stack = config.stack;
	if (config.stageStacks !== undefined) record.stageStacks = { ...config.stageStacks };
	if (config.reviewer !== undefined) record.reviewer = config.reviewer;
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
	given: RunWorkflowOptions
): Promise<WorkflowRun> {
	// The bot for this journey's world, when the host names one per world (WP112).
	const options: RunWorkflowOptions = {
		...given,
		spec: given.specFor?.(spec.worldId) ?? given.spec
	};
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
	// The person at every human stage, as a model (WP115), resolved once; absent, the oracle as ever.
	const reviewer =
		config.reviewer !== undefined ? resolveReviewer(registry, config.reviewer) : undefined;
	// The person at the approvals an agent stage and a boundary raise (WP171): drawn from the model when it names a refusal, a question or a lateness — and only then, so a model that names none leaves every approval as it was.
	const approver =
		reviewer && namesPersonRates(reviewer) && !options.approve
			? createApprover(reviewer, reviewerRandom(options.seed ?? 1, item.id, 'approvals', 0))
			: undefined;
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
	/** The executor of the stage now running — what the ceiling guard asks: a person's decision is not the level's. */
	let currentExecutor: Executor | undefined;
	/**
	 * **The ceiling, enforced** (WP139, `110-…` §6): at a deciding stage's output, a decision this
	 * configuration's level would take above its kind's ceiling pauses for a person — the boundary's
	 * own approval round-trip, on the record as `approval.requested`/`resolved` and the verdict
	 * `workflow/ceiling`. A stage a person executed decided at no level; a declined pause halts.
	 */
	const ceilingGuard = (stage: StageSpec): Guardrail[] => {
		const autonomy = config.autonomy;
		if (!autonomy?.enforce || !autonomy.ceilings || !spec.decisionKindOf) return [];
		const decisionKindOf = spec.decisionKindOf;
		const ceilings = autonomy.ceilings;
		return [
			{
				id: CEILING_GUARDRAIL_ID,
				name: 'Decision rights',
				description: 'A decision above its ceiling waits for a person.',
				hooks: ['post-act'],
				check: (ctx) => {
					if (currentExecutor?.kind === 'human') return { allow: true };
					const kind = decisionKindOf(stage.id, ctx.stage?.output);
					const ceiling = kind !== undefined ? ceilings[kind] : undefined;
					if (ceiling === undefined || autonomy.level <= ceiling) return { allow: true };
					return {
						pause: true,
						reason: `${kind} is decided alone up to Level ${ceiling}; this configuration runs at Level ${autonomy.level} — a person confirms it`
					};
				}
			}
		];
	};
	// What a boundary guard may ask the desk (WP137, `110-…` §6): its declared predicates over
	// the state — the same handle a session gives a loop guard — so a stage-in card can hold an
	// irreversible stage until the case file shows its preconditions done.
	const worldQuestions = {
		test: (id: string) => world.test(id),
		predicates: Object.keys(definition.predicates ?? {})
	};

	const runId = newId();
	const startedAt = now();
	const events: EngineEvent[] = [];
	const stages: StageRecord[] = [];
	const runIds: string[] = [];
	let ordinal = 0;
	/** The journey's elapsed ticks (WP146): a bot's stage spans its session's ticks, any other stage one. */
	let elapsed = 0;
	let reached = options.fromStage === undefined;

	/** A stage's value as the record keeps it; over the cap the host is handed the whole, under its digest (WP160). */
	function keepValue(value: unknown, role: 'input' | 'output', stageId: string) {
		const kept = stageValue(value, options.valueCap);
		if (!('value' in kept)) options.onValue?.({ digest: kept.digest, value, stageId, role });
		return kept;
	}

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
	/** The stage's output whole, as it left the stage (WP160): the record keeps a value only under the cap, and the next stage must not depend on that. */
	let latestOutput: unknown;
	/** A person was late at the last human stage (WP171): the loop makes the stage overdue. */
	let lateStage = false;
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
				: executorFrom(origin.config.executors?.[stage.id], [
						config.executors?.[stage.id],
						stage.executor,
						...Object.values(spec.configurations ?? {}).map(
							(configuration) => configuration.executors?.[stage.id]
						)
					])) ?? stage.executor;
		ordinal += 1;
		currentExecutor = executor;

		const record = await runStage(stage, executor, input);
		elapsed +=
			record.executor.kind === 'agent' ? Math.max(1, record.endedTick - record.startedTick) : 1;
		// A late person (WP171): they took longer than the stage's deadline, so it is overdue as any late stage is.
		if (lateStage) {
			lateStage = false;
			if (stage.deadline) elapsed = Math.max(elapsed, stage.deadline.ticks + 1);
		}
		// A deadline (WP146): a stage done past it is recorded overdue and said so on the trace.
		if (stage.deadline && elapsed > stage.deadline.ticks) {
			record.overdue = { deadline: stage.deadline.ticks, elapsed };
			emit('stage.overdue', {
				workflowRunId: runId,
				stageId: stage.id,
				deadline: stage.deadline.ticks,
				elapsed
			});
		}
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
		const output = latestOutput;
		const next = stage.next(output, world.snapshot(), input);
		// A handoff (WP102, `83-…` §6.5.3): the journey ends here; the host starts the target with the item.
		if (typeof next === 'object') {
			handoff = {
				to: next.handoff,
				itemId: next.item.id,
				item: next.item,
				...(next.kind ? { kind: next.kind } : {})
			};
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
				input: keepValue(stageInput, 'input', stage.id),
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
			input: keepValue(stageInput, 'input', stage.id),
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
			case 'reader':
				return readerStage(stage, executor, effectiveInput, base, started);
		}
	}

	type Base = Pick<StageRecord, 'stageId' | 'executor' | 'input'> & {
		/** What the reader answered, when a `reader` executor took the stage (WP117). */
		reader?: ReaderRecord;
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
		const chain = [
			...(options.boundaryGuardrailsFor?.(stage, point) ?? []),
			...(point === 'stage-out' ? ceilingGuard(stage) : [])
		];
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
				world: worldQuestions,
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
				const person = approver?.(proposed);
				const approved = person
					? person.approved
					: options.approve
						? options.approve(stage, proposed)
						: true;
				if (person?.meta.drew)
					write('reviewer.drew', {
						...person.meta.drew,
						workflowRunId: runId,
						stageId: stage.id,
						proposed: proposed.name
					});
				write('approval.resolved', {
					approved,
					...(person ? { by: person.by } : options.principal ? { by: options.principal } : {}),
					...(person?.meta.reason ? { reason: person.meta.reason } : {})
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
		extra: Partial<Pick<StageRecord, 'runId' | 'approval' | 'by'>> = {},
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
		latestOutput = value === undefined ? null : value;
		const out = keepValue(latestOutput, 'output', base.stageId);
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
			},
			...(extra.by ? { by: extra.by } : {})
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
			const person = approver?.(event.payload.proposed);
			if (person) {
				session.resolveApproval(person.approved, person.by, person.meta);
				return;
			}
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
		started: string,
		/** False when a gated `reader` stage runs this as its `else`, under the `stage.started` it already wrote. */
		announce = true
	): Promise<StageRecord> {
		if (announce)
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
				...(result.stateDiff !== undefined ? { stateDiff: result.stateDiff } : {}),
				...(result.disclosures ? { disclosures: result.disclosures } : {}),
				...(result.seatLines ? { seatLines: result.seatLines } : {})
			}
		});
		// A mandatory disclosure a rule's call made (WP145): as the session writes it.
		for (const disclosure of result.disclosures ?? [])
			emit('disclosure.given', {
				id: disclosure.id,
				action: call.name,
				digest: sha256Hex(disclosure.text)
			});
		// What the scripted visitor said in answer (WP160): as the session writes it.
		for (const line of result.seatLines ?? []) emit('seat.said', line);
		return result;
	}

	async function humanStage(
		stage: StageSpec,
		executor: Extract<Executor, { kind: 'human' }>,
		stageInput: unknown,
		base: Base,
		started: string,
		/** False when a gated `reader` stage runs this as its `else`, under the `stage.started` it already wrote. */
		announce = true
	): Promise<StageRecord> {
		if (announce)
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
		// The person as a model (WP115, `103-…` §6), when the configuration names one: it answers, whatever the host would have.
		const drawn = reviewer
			? reviewerAnswerDrawn(
					reviewer,
					executor.options,
					suggested ?? executor.default ?? executor.options[0] ?? '',
					stage.recommended?.(stageInput, state) ?? recommendationIn(stageInput, executor.options),
					reviewerRandom(options.seed ?? 1, item.id, stage.id, ordinal)
				)
			: undefined;
		// A person who asks a question or is late (WP171): drawn from a stream of their own, and only for the rates the model names.
		const person =
			reviewer && drawn && namesPersonRates(reviewer)
				? personAtStage(
						reviewer,
						reviewerRandom(options.seed ?? 1, item.id, `${stage.id}#person`, ordinal)
					)
				: undefined;
		const by = drawn
			? {
					...drawn.answer,
					...(person?.asked
						? { asked: true as const, seconds: drawn.answer.seconds + person.extraSeconds }
						: {}),
					...(person?.late ? { late: true as const } : {})
				}
			: undefined;
		if (by?.late) lateStage = true;
		// What the person drew (WP160): the rates in force, the rolls and the path, so a slip is not read as a planted fault.
		if (reviewer && drawn)
			emit('reviewer.drew', {
				workflowRunId: runId,
				stageId: stage.id,
				model: reviewer.id,
				rates: ratesOf(reviewer),
				path: drawn.draw.path,
				rolls: [...drawn.draw.rolls, ...(person?.rolls ?? [])],
				...(by?.late ? { late: true as const } : {})
			});
		// The question re-prompts the stage once (WP171): the person is asked again before they answer.
		if (by?.asked)
			emit('approval.requested', {
				proposed,
				reason: `Asked first, asked again: ${executor.prompt}`
			});
		const answer: HumanDecision = by
			? { decision: by.answer, ...(by.reason !== undefined ? { reason: by.reason } : {}) }
			: options.human
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
		// An override (WP146): the person chose other than what the case put in front of them.
		const shown =
			stage.recommended?.(stageInput, state) ?? recommendationIn(stageInput, executor.options);
		const overrode = shown !== undefined && answer.decision !== shown;
		const why = overrode && answer.reason?.trim() ? answer.reason.trim() : undefined;
		emit('approval.resolved', {
			approved: answer.decision === first,
			...(answer.by ? { by: answer.by } : {}),
			...(overrode ? { override: true as const } : {}),
			...(why !== undefined ? { reason: why } : {})
		});
		const read = readOutput(stage, { decision: answer.decision }, false);
		const approval = {
			requested: true as const,
			...(answer.by ? { by: answer.by } : {}),
			decision: answer.decision,
			...(overrode ? { override: true as const } : {}),
			...(why !== undefined ? { reason: why } : {})
		};
		if ('finding' in read) {
			return finishStage(base, started, ordinal, ordinal, undefined, [], 'error', read.finding, 0, {
				approval,
				...(by ? { by } : {})
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
			{ approval, ...(by ? { by } : {}) }
		);
	}

	/**
	 * **The `reader` executor** (WP117, `104-READERS.md` §4.1): ask the reader
	 * what the stage shows it, check and round the answers, read the gate, say
	 * so on `reader.answered`; then either commit the reader's output (its
	 * `act` performed as a rule's call is) or run the gate's `else` on the same
	 * input under the same stage. A reader that throws or answers wrongly is an
	 * error, never a gate: a broken reader is a defect, a low confidence is not.
	 */
	async function readerStage(
		stage: StageSpec,
		executor: Extract<Executor, { kind: 'reader' }>,
		stageInput: unknown,
		base: Base,
		started: string
	): Promise<StageRecord> {
		emit('stage.started', {
			workflowRunId: runId,
			stageId: stage.id,
			executor: 'reader',
			input: base.input
		});
		const fail = (finding: string, at: Base = base) =>
			finishStage(at, started, ordinal, ordinal, undefined, [], 'error', finding, 0);
		const state = world.snapshot();
		const questions = executor.questions(stageInput, state);
		const resolved = resolveReader(registry, executor, questions);
		if ('finding' in resolved) return fail(resolved.finding);
		let response;
		try {
			const provider =
				resolved.reader.kind === 'llm' ? options.readerProvider?.(resolved.reader) : undefined;
			response = await resolved.reader.ask(executor.subject(stageInput, state), questions, {
				callLine,
				...(provider ? { provider } : {})
			});
		} catch (error) {
			return fail(`the reader failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		const checked = checkedAnswers(questions, response);
		if ('finding' in checked) return fail(checked.finding);
		const gate = readGate(executor, checked.answers);
		const reader = readerRecordOf(executor.readerId, response, checked.answers, gate);
		emit('reader.answered', {
			workflowRunId: runId,
			stageId: stage.id,
			questionIds: Object.keys(questions),
			...reader
		});
		const withReader: Base = { ...base, reader };
		if (gate.gated && executor.gate) {
			const fallback = executor.gate.else;
			return fallback.kind === 'rule'
				? ruleStage(stage, fallback, stageInput, withReader, started, false)
				: humanStage(stage, fallback, stageInput, withReader, started, false);
		}
		const read = readOutput(stage, executor.output(checked.answers, stageInput), false);
		if ('finding' in read) return fail(read.finding, withReader);
		const call = executor.act?.(read.output, stageInput, world.snapshot());
		if (call) {
			const result = perform(call);
			if (!result.ok)
				return fail(`the world refused ${call.name}: ${result.narration}`, withReader);
		}
		return finishStage(withReader, started, ordinal, ordinal, read.output, [], 'ok', undefined, 0);
	}

	/** The synthesised tool a service line's operation runs as, when the line is registered. */
	function toolFor(lineId: string, operation: string) {
		const line = registry.getServiceLine(lineId);
		const packId = line ? packOf(registry, lineId) : undefined;
		return packId !== undefined
			? registry.getTool(serviceLineToolId(packId, lineId, operation))
			: undefined;
	}

	/**
	 * **One call to a service line** (WP79's line stage; WP120's hosted readers,
	 * `104-READERS.md` §10.1): the synthesised tool run over the desk's state,
	 * written as `tool.executed` on the workflow's events — so a cassette
	 * replays by the same arguments whether a `line` stage or a reader asked.
	 */
	async function callLine(lineId: string, operation: string, args: unknown): Promise<ToolResult> {
		const tool = toolFor(lineId, operation);
		if (!tool) return { ok: false, output: `no tool for ${lineId} ${operation}` };
		const before = now();
		const notes: string[] = [];
		const result = await tool.execute(args, {
			tick: ordinal,
			notebook: { read: () => [...notes], append: (line) => void notes.push(line) },
			random,
			worldState: world.snapshot()
		});
		emit('tool.executed', {
			name: tool.id,
			arguments: args,
			result: result.output,
			...(result.data !== undefined ? { data: result.data } : {}),
			durationMs: Math.max(0, Date.parse(now()) - Date.parse(before))
		});
		return result;
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
		if (!toolFor(executor.lineId, executor.operation)) {
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
		const result = await callLine(executor.lineId, executor.operation, args);
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

/**
 * An executor read back off a record — the same shape, `undefined` keys
 * dropped. A `reader` executor's functions are not on the record, so it is
 * found among the ones the new configuration and the spec give that stage
 * (the same reader, the same gate); none found, the stage's default.
 */
function executorFrom(
	record: ExecutorRecord | undefined,
	candidates: readonly (Executor | undefined)[] = []
): Executor | undefined {
	if (!record) return undefined;
	switch (record.kind) {
		case 'reader':
			return candidates.find(
				(candidate): candidate is Executor =>
					candidate?.kind === 'reader' &&
					canonicalJson(executorRecord(candidate)) === canonicalJson(record)
			);
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
