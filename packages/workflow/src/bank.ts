import {
	canonicalJson,
	sha256Hex,
	type AnyAgentSpec,
	type BankRun,
	type ContextSpec,
	type EngineEvent,
	type LLMProvider,
	type PackManifest,
	type StageSpec,
	type WorkItem,
	type WorkItemKind,
	type WorkflowConfig,
	type WorkflowRun,
	type WorkflowSpec,
	type WorldState,
	type Executor
} from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import { runWorkflow, type HumanDecision, type RunWorkflowOptions } from './run.js';

/**
 * **The scheduler** (WP83, `71-THE-CLOCK.md` §4; `64-…` §6.5.2; tenet 24):
 * work items arriving on a clock, routed by kind to desks that work them
 * through `runWorkflow` up to a concurrency, every run and trace reaching a
 * sink, the day recorded as a `BankRun`. Scheduling never reaches a
 * result: each item's clocks are seeded from the bank's seed and the item's
 * ordinal, so a run is the same bytes at concurrency 1 and 4, and the
 * `BankRun`'s digest is over the runs in arrival order.
 */
export interface Arrival {
	at: string;
	ordinal: number;
	item: WorkItem;
}

export interface DeskAssignment {
	id: string;
	workflowId: string;
	/** The item kinds this desk takes; an item goes to the first desk whose kinds include its kind. */
	kinds: WorkItemKind[];
	/** The workflow's named configuration, and/or knobs and a context rung over it. */
	configuration?: string;
	config?: WorkflowConfig;
	concurrency: number;
	build: string;
}

export interface MonitorSink {
	workflowRun(entry: { desk: string; item: WorkItem; run: WorkflowRun }): void | Promise<void>;
	agentRun(entry: {
		desk: string;
		itemId: string;
		runId: string;
		spec: AnyAgentSpec;
		events: EngineEvent[];
	}): void | Promise<void>;
	bankRun(record: BankRun): void | Promise<void>;
}

/** A sink that keeps everything — a test's, and the Worker's before it posts. */
export function memorySink(): MonitorSink & {
	workflowRuns: Array<{ desk: string; item: WorkItem; run: WorkflowRun }>;
	agentRuns: Array<{
		desk: string;
		itemId: string;
		runId: string;
		spec: AnyAgentSpec;
		events: EngineEvent[];
	}>;
	bankRuns: BankRun[];
} {
	const workflowRuns: Array<{ desk: string; item: WorkItem; run: WorkflowRun }> = [];
	const agentRuns: Array<{
		desk: string;
		itemId: string;
		runId: string;
		spec: AnyAgentSpec;
		events: EngineEvent[];
	}> = [];
	const bankRuns: BankRun[] = [];
	return {
		workflowRuns,
		agentRuns,
		bankRuns,
		workflowRun: (entry) => void workflowRuns.push(entry),
		agentRun: (entry) => void agentRuns.push(entry),
		bankRun: (record) => void bankRuns.push(record)
	};
}

export interface RunBankOptions {
	packs: PackManifest[];
	/** The workflows by id — the registry's, or a test's own. */
	workflows: WorkflowSpec[];
	specFor: (desk: DeskAssignment) => AnyAgentSpec;
	providerFor: (desk: DeskAssignment, stage: StageSpec, goalCardId: string) => LLMProvider;
	/** Each stage's boundary chain (WP95), compiled by the host. */
	boundaryGuardrailsFor?: RunWorkflowOptions['boundaryGuardrailsFor'];
	human?: (
		desk: DeskAssignment,
		stage: StageSpec,
		state: WorldState,
		executor: Extract<Executor, { kind: 'human' }>,
		suggested: string | undefined
	) => Promise<HumanDecision> | HumanDecision;
	seed: number;
	/** The clock as data, for the record. */
	clock: BankRun['clock'];
	populationDigest?: string;
	/** Bank-level ids and times: the `BankRun`'s id. Item runs seed their own from the ordinal. */
	newId?: () => string;
	/** Stop taking arrivals after this many; the rest are counted, never worked. */
	stopAfter?: number;
	onProgress?: (progress: { arrived: number; worked: number; inFlight: number }) => void;
	onIncident?: (incident: BankRun['incidents'][number]) => void;
	onWorkflowRun?: (entry: { desk: string; item: WorkItem; run: WorkflowRun }) => void;
	/** Every arrival as the clock delivers it, with the desk it was routed to — none for an unrouted kind or after `stopAfter` (WP84, `75-…` §4). */
	onArrival?: (arrival: Arrival, desk: string | undefined) => void;
}

/** A counter clock for one item: ids and timestamps that depend only on the bank's seed and the item's ordinal. */
export function itemClock(seed: number, ordinal: number, at: string, salt = 0) {
	const base = Date.parse(at);
	let ids = 0;
	let ticks = 0;
	const random = seededRandom(((seed ^ 0x2545f491) + ordinal * 0x9e3779b9 + salt) >>> 0);
	const offset = ((ordinal * 1_000_003 + salt) % 4_000_000_000) >>> 0;
	return {
		now: () => new Date(base + (ticks += 1) * 1000).toISOString(),
		newId: () => {
			ids += 1;
			const high = offset.toString(16).padStart(8, '0');
			const low = ids.toString(16).padStart(12, '0');
			return `${high.slice(0, 8)}-0000-4000-8000-${low}`;
		},
		random
	};
}

export async function runBank(
	clock: AsyncIterable<Arrival>,
	desks: DeskAssignment[],
	sink: MonitorSink,
	options: RunBankOptions
): Promise<BankRun> {
	if (desks.length === 0) throw new Error('a bank day needs at least one desk');
	const byId = new Map(options.workflows.map((workflow) => [workflow.id, workflow]));
	for (const desk of desks) {
		if (!byId.has(desk.workflowId)) {
			throw new Error(
				`desk "${desk.id}" names workflow "${desk.workflowId}", which is not installed`
			);
		}
	}
	const started = Date.now();
	const counts: BankRun['counts'] = {
		arrivals: {},
		routed: 0,
		unrouted: 0,
		completed: 0,
		stopped: 0,
		byDesk: Object.fromEntries(
			desks.map((desk) => [desk.id, { worked: 0, completed: 0, stopped: 0, handedOff: 0 }])
		)
	};
	const incidents: BankRun['incidents'] = [];
	const runs: BankRun['runs'] = [];
	const queues = new Map<string, Arrival[]>(desks.map((desk) => [desk.id, []]));
	// WP102 (`83-…` §6.5.3): the items runs hand off, waiting to be routed by kind like any arrival; their ordinals continue the clock's.
	const handoffs: Arrival[] = [];
	let handoffOrdinal = 0;
	const inFlight = new Map<string, number>(desks.map((desk) => [desk.id, 0]));
	const workedIds = new Set<string>();
	let arrived = 0;
	let worked = 0;
	let firstAt: string | undefined;
	let lastAt: string | undefined;
	let clockDone = false;
	let wake: (() => void) | undefined;
	const wakeAll = () => {
		const resolve = wake;
		wake = undefined;
		resolve?.();
	};
	const progress = () =>
		options.onProgress?.({
			arrived,
			worked,
			inFlight: [...inFlight.values()].reduce((sum, n) => sum + n, 0)
		});

	async function workOne(desk: DeskAssignment, arrival: Arrival): Promise<void> {
		if (workedIds.has(arrival.item.id)) throw new Error(`item ${arrival.item.id} worked twice`);
		workedIds.add(arrival.item.id);
		const workflow = byId.get(desk.workflowId) as WorkflowSpec;
		const named = desk.configuration ? workflow.configurations?.[desk.configuration] : undefined;
		if (desk.configuration && !named) {
			throw new Error(
				`desk "${desk.id}" names configuration "${desk.configuration}", which workflow "${workflow.id}" does not have`
			);
		}
		const config: WorkflowConfig = {
			...(named ?? {}),
			...(desk.config ?? {}),
			...(named?.knobs || desk.config?.knobs
				? { knobs: { ...(named?.knobs ?? {}), ...(desk.config?.knobs ?? {}) } }
				: {}),
			...(desk.config?.context ? { context: desk.config.context as ContextSpec } : {})
		};
		const pending: Promise<void>[] = [];
		const journey = itemClock(options.seed, arrival.ordinal, arrival.at, 1);
		const seat = itemClock(options.seed, arrival.ordinal, arrival.at, 2);
		const run = await runWorkflow(workflow, arrival.item, {
			packs: options.packs,
			spec: options.specFor(desk),
			config,
			providerFor: (stage, goalCardId) => options.providerFor(desk, stage, goalCardId),
			...(options.boundaryGuardrailsFor
				? { boundaryGuardrailsFor: options.boundaryGuardrailsFor }
				: {}),
			...(options.human
				? {
						human: (
							stage: StageSpec,
							state: WorldState,
							executor: Extract<Executor, { kind: 'human' }>,
							suggested: string | undefined
						) => options.human!(desk, stage, state, executor, suggested)
					}
				: {}),
			now: journey.now,
			newId: journey.newId,
			random: journey.random,
			session: { now: seat.now, newId: seat.newId, random: seat.random, tickDelayMs: 0 },
			...(options.populationDigest !== undefined
				? { populationDigest: options.populationDigest }
				: {}),
			onAgentRun: (agentRun) => {
				// Awaited before the workflow run lands (WP84): a sink that writes elsewhere must hold every agent run first.
				pending.push(
					Promise.resolve(
						sink.agentRun({
							desk: desk.id,
							itemId: arrival.item.id,
							runId: agentRun.runId,
							spec: agentRun.spec,
							events: agentRun.events
						})
					)
				);
			}
		});
		await Promise.all(pending);
		await sink.workflowRun({ desk: desk.id, item: arrival.item, run });
		options.onWorkflowRun?.({ desk: desk.id, item: arrival.item, run });
		const tally = counts.byDesk[desk.id] as {
			worked: number;
			completed: number;
			stopped: number;
			handedOff?: number;
		};
		tally.worked += 1;
		if (run.outcome === 'handed-off' && run.handoff) {
			counts.handedOff = (counts.handedOff ?? 0) + 1;
			tally.handedOff = (tally.handedOff ?? 0) + 1;
			handoffOrdinal += 1;
			const arrival: Arrival = {
				ordinal: 1_000_000 + handoffOrdinal,
				at: run.finishedAt,
				item: run.handoff.item
			};
			if (desks.some((candidate) => candidate.kinds.includes(arrival.item.kind))) {
				handoffs.push(arrival);
			} else {
				// No desk of the day takes the kind: counted as unrouted, as the clock's own arrivals are.
				counts.arrivals[arrival.item.kind] = (counts.arrivals[arrival.item.kind] ?? 0) + 1;
				counts.unrouted += 1;
				options.onArrival?.(arrival, undefined);
			}
		} else if (run.outcome === 'completed') {
			counts.completed += 1;
			tally.completed += 1;
		} else {
			counts.stopped += 1;
			tally.stopped += 1;
			const failed = run.stages.find(
				(stage) => stage.status === 'error' || stage.status === 'blocked'
			);
			const incident: BankRun['incidents'][number] = {
				runId: run.id,
				itemId: arrival.item.id,
				desk: desk.id,
				...(failed ? { stageId: failed.stageId, status: failed.status } : {}),
				...(failed?.finding !== undefined ? { finding: failed.finding } : {})
			};
			incidents.push(incident);
			options.onIncident?.(incident);
		}
		runs.push({
			ordinal: arrival.ordinal,
			itemId: arrival.item.id,
			kind: arrival.item.kind,
			desk: desk.id,
			runId: run.id,
			digest: run.digest,
			outcome: run.outcome
		});
		worked += 1;
		progress();
	}

	/** Whether every lane is idle and nothing waits anywhere — the day's true end once the clock is done. */
	const drained = () =>
		handoffs.length === 0 &&
		[...queues.values()].every((queue) => queue.length === 0) &&
		[...inFlight.values()].every((count) => count === 0);

	async function lane(desk: DeskAssignment): Promise<void> {
		const queue = queues.get(desk.id) as Arrival[];
		for (;;) {
			// This desk's own queue first, then a handed-off item of a kind it takes (WP102).
			let next = queue.shift();
			if (!next) {
				const index = handoffs.findIndex((arrival) => desk.kinds.includes(arrival.item.kind));
				if (index !== -1) {
					next = handoffs[index];
					handoffs.splice(index, 1);
					if (next) {
						counts.arrivals[next.item.kind] = (counts.arrivals[next.item.kind] ?? 0) + 1;
						counts.routed += 1;
						options.onArrival?.(next, desk.id);
					}
				}
			}
			if (next) {
				inFlight.set(desk.id, (inFlight.get(desk.id) ?? 0) + 1);
				try {
					await workOne(desk, next);
				} finally {
					inFlight.set(desk.id, (inFlight.get(desk.id) ?? 1) - 1);
					// A handoff may have landed for another lane, and a lane may be waiting on the day's last run (WP102).
					wakeAll();
				}
				continue;
			}
			if (clockDone && drained()) return;
			await new Promise<void>((resolve) => {
				const previous = wake;
				wake = () => {
					previous?.();
					resolve();
				};
			});
		}
	}

	const lanes = desks.flatMap((desk) =>
		Array.from({ length: Math.max(1, Math.floor(desk.concurrency)) }, () => lane(desk))
	);

	let taken = 0;
	for await (const arrival of clock) {
		arrived += 1;
		counts.arrivals[arrival.item.kind] = (counts.arrivals[arrival.item.kind] ?? 0) + 1;
		firstAt ??= arrival.at;
		lastAt = arrival.at;
		if (options.stopAfter !== undefined && taken >= options.stopAfter) {
			options.onArrival?.(arrival, undefined);
			continue;
		}
		const desk = desks.find((candidate) => candidate.kinds.includes(arrival.item.kind));
		options.onArrival?.(arrival, desk?.id);
		if (!desk) {
			counts.unrouted += 1;
			continue;
		}
		taken += 1;
		counts.routed += 1;
		(queues.get(desk.id) as Arrival[]).push(arrival);
		wakeAll();
		progress();
	}
	clockDone = true;
	wakeAll();
	await Promise.all(lanes);

	runs.sort((a, b) => a.ordinal - b.ordinal);
	const record: BankRun = {
		schemaVersion: 1,
		id: options.newId?.() ?? `bank-${options.seed}-${options.clock.from}`,
		clock: options.clock,
		...(options.populationDigest !== undefined
			? { populationDigest: options.populationDigest }
			: {}),
		desks: desks.map((desk) => ({
			id: desk.id,
			workflowId: desk.workflowId,
			kinds: [...desk.kinds],
			...(desk.configuration !== undefined ? { configuration: desk.configuration } : {}),
			...(desk.config?.knobs ? { knobs: { ...desk.config.knobs } } : {}),
			...(desk.config?.context ? { context: desk.config.context } : {}),
			concurrency: desk.concurrency,
			build: desk.build
		})),
		counts,
		incidents,
		runs,
		startedAt: firstAt ?? `${options.clock.from}T00:00:00.000Z`,
		finishedAt: lastAt ?? `${options.clock.to}T23:59:59.000Z`,
		wallMs: Date.now() - started,
		digest: sha256Hex(canonicalJson(runs.map((run) => run.digest)))
	};
	await sink.bankRun(record);
	return record;
}
