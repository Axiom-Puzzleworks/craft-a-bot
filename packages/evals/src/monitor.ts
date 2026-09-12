import type {
	EngineEvent,
	RunSummaryFinding,
	WorkItem,
	WorkItemKind,
	WorkflowRun,
	WorkflowSpec
} from '@craftabot/core';
import { summariseRun } from '@craftabot/governance/reports';
import {
	fairnessMetric,
	psiCategorical,
	touchesPerCase,
	unattendedRate,
	wilson,
	type DecidedCase,
	type Decision,
	type FairnessMetricId,
	type Interval,
	type PsiResult
} from '@craftabot/metrics';
import { touchedCaseOf } from '@craftabot/workflow';
import { cohortOf, decisionOf } from './campaign.js';

/**
 * **The Monitor's fold** (WP84, `75-THE-MONITOR.md` §3; `64-…` §6.5.3,
 * tenets 20 and 25): the bank's day as numbers, every one the same fold the
 * campaign report uses — `decisionOf` and `cohortOf` for a decision and its
 * cohort, `touchedCaseOf` with `touchesPerCase`/`unattendedRate` for the
 * human load, `wilson` for the bands, `fairnessMetric` over the same
 * `DecidedCase`s the `parity` gate builds, `psiCategorical` as the `drift`
 * gate reads it, `summariseRun` as the incident log does. The Monitor adds
 * a window (the last *n* runs) and a clock (buckets by simulated hour);
 * nothing else. A pure function: the same runs give the same state, which
 * is what Replay relies on.
 */
export interface MonitorRun {
	desk: string;
	item: WorkItem;
	run: WorkflowRun;
	/** The events of every agent run the workflow made, in order — the report's cell reads the same list. */
	agentEvents: readonly EngineEvent[];
}

export interface MonitorArrival {
	desk?: string | undefined;
	itemId: string;
	kind: WorkItemKind;
	at: string;
}

export interface MonitorReference {
	/** The population's expected approval rate — the hairline on the approval tape. */
	approvalRate?: number | undefined;
	/** The expected outcome mix, as shares. */
	outcomeMix?: Record<Decision, number> | undefined;
	/** The expected verdicts, one per item — the reference sample PSI reads. */
	verdicts?: readonly Decision[] | undefined;
}

export interface MonitorOptions {
	/** The day (or days), ISO dates: the tapes hold one bucket per simulated hour across them. */
	from: string;
	to: string;
	/** The rolling window: the readouts, fairness and drift read the last `window` runs. Default 200. */
	window?: number;
	/** The window's floor before the fairness pane wakes. Default 40. */
	minimum?: number;
	/** The cohort attribute fairness reads across. Default `ageBand`, the bank's first cohort attribute. */
	across?: string;
	metrics?: readonly Exclude<FairnessMetricId, 'counterfactual-flip'>[];
	reference?: MonitorReference | undefined;
	/** Per workflow id, the spec's own decision-kind reader, for the ceilings. */
	decisionKindOf?: (workflowId: string) => WorkflowSpec['decisionKindOf'];
	desks?: readonly { id: string; concurrency: number }[];
	/** Every arrival the clock delivered, for the queue view and the arrival counts; the runs' items without it. */
	arrivals?: readonly MonitorArrival[];
	/** The simulated clock, for the oldest waiting item's age; the latest arrival or finish without it. */
	now?: string | undefined;
}

export interface MonitorRate {
	value: number;
	interval: Interval;
	n: number;
}

export interface MonitorReadouts {
	/** All day, by kind. */
	arrivals: Record<string, number>;
	/** Over the window. */
	runs: number;
	decided: number;
	decisions: Record<Decision, number>;
	approvalRate: MonitorRate;
	referralRate: MonitorRate;
	escalations: number;
	guardrailTrips: number;
	guardrailTripsPerDecision: number;
	approvals: number;
	approvalsPerDecision: number;
	meanStageDurationMs: Record<string, number>;
	tokens: number;
	tokensPerDecision: number;
	incidentsOpen: number;
	touchesPerCase: MonitorRate & { underpowered: boolean; byKind: Record<string, number> };
	unattendedRate: MonitorRate;
	ceilingDecisions: number;
	breaches: number;
	ceilingBreachRate: MonitorRate;
}

export interface MonitorBucket {
	index: number;
	/** `YYYY-MM-DD HH:00`, simulated. */
	label: string;
	arrivals: Record<string, number>;
	runs: number;
	decided: number;
	decisions: Record<Decision, number>;
	approvalRate?: number | undefined;
	referralRate?: number | undefined;
	escalations: number;
	guardrailTripsPerDecision?: number | undefined;
	approvalsPerDecision?: number | undefined;
	tokensPerDecision?: number | undefined;
	meanStageDurationMs?: number | undefined;
}

export interface MonitorFairnessRow {
	metric: FairnessMetricId;
	across: string;
	value?: number | undefined;
	interval?: Interval | undefined;
	n: number;
	groups: string[];
	rates: Record<string, number>;
	underpowered: boolean;
	reason?: string | undefined;
}

export interface MonitorDriftRow {
	feature: string;
	psi?: PsiResult | undefined;
	flagged: boolean;
	reason?: string | undefined;
}

export interface MonitorIncident {
	workflowRunId: string;
	runId?: string | undefined;
	itemId: string;
	desk: string;
	stageId?: string | undefined;
	status?: string | undefined;
	finding?: string | undefined;
	findings: RunSummaryFinding[];
}

export interface MonitorQueue {
	desk: string;
	arrived: number;
	waiting: number;
	inProgress: number;
	done: number;
	/** Simulated minutes the oldest waiting item has waited; none when nothing waits. */
	oldestWaitingMinutes?: number | undefined;
}

export interface MonitorState {
	/** The simulated clock the fold read: the latest arrival or finish, or the option. */
	now: string | undefined;
	windowFull: boolean;
	readouts: MonitorReadouts;
	buckets: MonitorBucket[];
	fairness: MonitorFairnessRow[];
	drift: MonitorDriftRow[];
	incidents: MonitorIncident[];
	queues: MonitorQueue[];
}

export const DEFAULT_MONITOR_WINDOW = 200;
export const DEFAULT_MONITOR_MINIMUM = 40;
export const DEFAULT_MONITOR_METRICS: readonly Exclude<FairnessMetricId, 'counterfactual-flip'>[] =
	['demographic-parity', 'disparate-impact', 'equal-opportunity'];
const OUTCOMES: readonly Decision[] = ['approve', 'decline', 'refer'];

/** The truth the report reads for a run: the world's, on the last `run.finished` the agent runs carry, else the item's own. */
export function truthOfRun(entry: MonitorRun): unknown {
	let truth: unknown;
	for (const event of entry.agentEvents) {
		if (event.type === 'run.finished' && event.payload.truth !== undefined)
			truth = event.payload.truth;
	}
	return truth ?? entry.item.truth;
}

/** The report's decision for a workflow run: `decisionOf` over the agent runs' events and the run's own, as the book cell scores it. */
export function outcomeOfRun(entry: MonitorRun): Decision | undefined {
	return decisionOf([...entry.agentEvents, ...entry.run.events], truthOfRun(entry))?.outcome;
}

/** The verdict the truth carries for an item (`should-approve` → `approve`), or none. */
export function verdictOfItem(item: WorkItem): Decision | undefined {
	const facts = (item.truth as { facts?: Record<string, unknown> } | undefined)?.facts;
	const label = facts?.['verdict'];
	if (typeof label !== 'string') return undefined;
	const verdict = label.replace(/^should-/, '');
	return (OUTCOMES as readonly string[]).includes(verdict) ? (verdict as Decision) : undefined;
}

/** The population's expectation over a set of items: the verdict mix in truth, and the approval rate it implies. */
export function referenceFromItems(items: readonly WorkItem[]): MonitorReference {
	const verdicts = items.map(verdictOfItem).filter((v): v is Decision => v !== undefined);
	if (verdicts.length === 0) return {};
	const mix = Object.fromEntries(
		OUTCOMES.map((outcome) => [
			outcome,
			verdicts.filter((verdict) => verdict === outcome).length / verdicts.length
		])
	) as Record<Decision, number>;
	return { approvalRate: mix.approve, outcomeMix: mix, verdicts };
}

const rate = (k: number, n: number): MonitorRate => {
	const interval = wilson(k, n, 0.95);
	return { value: n === 0 ? 0 : k / n, interval: [interval[0], interval[1]], n };
};

const tokensOf = (events: readonly EngineEvent[]): number => {
	let total = 0;
	for (const event of events) {
		if (event.type === 'think.completed') {
			total += event.payload.response.usage.inputTokens;
			total += event.payload.response.usage.outputTokens;
		}
	}
	return total;
};

const hourOf = (at: string, from: string): number =>
	Math.floor((Date.parse(at) - Date.parse(`${from}T00:00:00.000Z`)) / 3_600_000);

const emptyDecisions = (): Record<Decision, number> => ({ approve: 0, decline: 0, refer: 0 });

export function foldMonitor(runs: readonly MonitorRun[], options: MonitorOptions): MonitorState {
	const window = options.window ?? DEFAULT_MONITOR_WINDOW;
	const minimum = options.minimum ?? DEFAULT_MONITOR_MINIMUM;
	const across = options.across ?? 'ageBand';
	const metrics = options.metrics ?? DEFAULT_MONITOR_METRICS;

	// Arrival order: the run's start is the item's arrival on the clock; the id breaks a tie.
	const ordered = [...runs].sort(
		(a, b) => a.run.startedAt.localeCompare(b.run.startedAt) || a.run.id.localeCompare(b.run.id)
	);
	const windowed = ordered.slice(Math.max(0, ordered.length - window));
	const windowFull = ordered.length >= minimum;

	const arrivals: MonitorArrival[] =
		options.arrivals?.map((a) => ({ ...a })) ??
		ordered.map((entry) => ({
			desk: entry.desk,
			itemId: entry.item.id,
			kind: entry.item.kind,
			at: entry.item.arrivedAt
		}));
	const lastArrival = arrivals
		.map((a) => a.at)
		.sort()
		.at(-1);
	const lastFinish = ordered
		.map((entry) => entry.run.finishedAt)
		.sort()
		.at(-1);
	const now =
		options.now ??
		[lastArrival, lastFinish]
			.filter((v): v is string => v !== undefined)
			.sort()
			.at(-1);

	// The per-run facts every pane reads, computed once.
	const facts = new Map(
		ordered.map((entry) => {
			const outcome = outcomeOfRun(entry);
			const touched = touchedCaseOf(
				entry.run,
				options.decisionKindOf?.(entry.run.workflowId) ?? undefined
			);
			const ceilings = entry.run.config.autonomy?.ceilings ?? {};
			const breaches = (touched.decisions ?? []).filter((decision) => {
				const ceiling = ceilings[decision.kind];
				return ceiling !== undefined && decision.level > ceiling;
			}).length;
			return [
				entry.run.id,
				{
					outcome,
					touched,
					breaches,
					ceilingDecisions: touched.decisions?.length ?? 0,
					tokens: tokensOf(entry.agentEvents),
					escalations: entry.run.stages.filter((stage) => stage.status === 'escalated').length,
					trips: entry.run.stages.reduce((sum, stage) => sum + stage.guards.tripped.length, 0),
					approvals: entry.run.stages.filter((stage) => stage.approval !== undefined).length,
					hour: hourOf(entry.run.startedAt, options.from)
				}
			] as const;
		})
	);
	const factOf = (entry: MonitorRun) => facts.get(entry.run.id)!;

	// Readouts over the window.
	const decisions = emptyDecisions();
	let decided = 0;
	let escalations = 0;
	let trips = 0;
	let approvals = 0;
	let tokens = 0;
	let breaches = 0;
	let ceilingDecisions = 0;
	const durations = new Map<string, { total: number; n: number }>();
	for (const entry of windowed) {
		const fact = factOf(entry);
		if (fact.outcome) {
			decisions[fact.outcome] += 1;
			decided += 1;
		}
		escalations += fact.escalations;
		trips += fact.trips;
		approvals += fact.approvals;
		tokens += fact.tokens;
		breaches += fact.breaches;
		ceilingDecisions += fact.ceilingDecisions;
		for (const stage of entry.run.stages) {
			const slot = durations.get(stage.stageId) ?? { total: 0, n: 0 };
			slot.total += stage.durationMs;
			slot.n += 1;
			durations.set(stage.stageId, slot);
		}
	}
	const touched = windowed.map((entry) => factOf(entry).touched);
	const touches = touchesPerCase(touched);
	const unattended = unattendedRate(touched);
	const perDecision = (total: number) => (decided === 0 ? 0 : total / decided);

	const arrivalCounts: Record<string, number> = {};
	for (const arrival of arrivals)
		arrivalCounts[arrival.kind] = (arrivalCounts[arrival.kind] ?? 0) + 1;

	// Incidents: every stopped or blocked run, and every agent-run finding, with the workflow run beside it.
	const incidents: MonitorIncident[] = [];
	for (const entry of ordered) {
		if (entry.run.outcome !== 'completed') {
			const failed = entry.run.stages.find(
				(stage) => stage.status === 'error' || stage.status === 'blocked'
			);
			incidents.push({
				workflowRunId: entry.run.id,
				...(failed?.runId !== undefined ? { runId: failed.runId } : {}),
				itemId: entry.item.id,
				desk: entry.desk,
				...(failed ? { stageId: failed.stageId, status: failed.status } : {}),
				...(failed?.finding !== undefined ? { finding: failed.finding } : {}),
				findings: []
			});
		}
		const byRun = new Map<string, EngineEvent[]>();
		for (const event of entry.agentEvents) {
			const list = byRun.get(event.runId) ?? [];
			list.push(event);
			byRun.set(event.runId, list);
		}
		for (const [runId, events] of byRun) {
			const findings = summariseRun(runId, events).findings;
			if (findings.length === 0) continue;
			const stage = entry.run.stages.find((candidate) => candidate.runId === runId);
			incidents.push({
				workflowRunId: entry.run.id,
				runId,
				itemId: entry.item.id,
				desk: entry.desk,
				...(stage ? { stageId: stage.stageId, status: stage.status } : {}),
				findings
			});
		}
	}

	const readouts: MonitorReadouts = {
		arrivals: arrivalCounts,
		runs: windowed.length,
		decided,
		decisions,
		approvalRate: rate(decisions.approve, decided),
		referralRate: rate(decisions.refer, decided),
		escalations,
		guardrailTrips: trips,
		guardrailTripsPerDecision: perDecision(trips),
		approvals,
		approvalsPerDecision: perDecision(approvals),
		meanStageDurationMs: Object.fromEntries(
			[...durations].map(([stageId, slot]) => [stageId, slot.total / slot.n])
		),
		tokens,
		tokensPerDecision: perDecision(tokens),
		incidentsOpen: incidents.length,
		touchesPerCase: {
			value: touches.value,
			interval: [touches.interval[0], touches.interval[1]],
			n: touches.n,
			underpowered: touches.underpowered,
			byKind: touches.detail ?? {}
		},
		unattendedRate: {
			value: unattended.value,
			interval: [unattended.interval[0], unattended.interval[1]],
			n: unattended.n
		},
		ceilingDecisions,
		breaches,
		ceilingBreachRate: rate(breaches, ceilingDecisions)
	};

	// Buckets: one per simulated hour across the window of days; every run counts, not only the window's.
	const days = Math.max(
		1,
		Math.round(
			(Date.parse(`${options.to}T00:00:00.000Z`) - Date.parse(`${options.from}T00:00:00.000Z`)) /
				86_400_000
		) + 1
	);
	const buckets: MonitorBucket[] = Array.from({ length: days * 24 }, (_, index) => {
		const day = new Date(Date.parse(`${options.from}T00:00:00.000Z`) + index * 3_600_000);
		return {
			index,
			label: `${day.toISOString().slice(0, 10)} ${String(day.getUTCHours()).padStart(2, '0')}:00`,
			arrivals: {},
			runs: 0,
			decided: 0,
			decisions: emptyDecisions(),
			escalations: 0
		};
	});
	const bucketAt = (at: string) => buckets[hourOf(at, options.from)];
	for (const arrival of arrivals) {
		const bucket = bucketAt(arrival.at);
		if (bucket) bucket.arrivals[arrival.kind] = (bucket.arrivals[arrival.kind] ?? 0) + 1;
	}
	const tallies = new Map<
		number,
		{ trips: number; approvals: number; tokens: number; duration: number; stages: number }
	>();
	for (const entry of ordered) {
		const fact = factOf(entry);
		const bucket = buckets[fact.hour];
		if (!bucket) continue;
		bucket.runs += 1;
		bucket.escalations += fact.escalations;
		if (fact.outcome) {
			bucket.decided += 1;
			bucket.decisions[fact.outcome] += 1;
		}
		const tally = tallies.get(fact.hour) ?? {
			trips: 0,
			approvals: 0,
			tokens: 0,
			duration: 0,
			stages: 0
		};
		tally.trips += fact.trips;
		tally.approvals += fact.approvals;
		tally.tokens += fact.tokens;
		for (const stage of entry.run.stages) {
			tally.duration += stage.durationMs;
			tally.stages += 1;
		}
		tallies.set(fact.hour, tally);
	}
	for (const bucket of buckets) {
		const tally = tallies.get(bucket.index);
		if (bucket.decided > 0) {
			bucket.approvalRate = bucket.decisions.approve / bucket.decided;
			bucket.referralRate = bucket.decisions.refer / bucket.decided;
			if (tally) {
				bucket.guardrailTripsPerDecision = tally.trips / bucket.decided;
				bucket.approvalsPerDecision = tally.approvals / bucket.decided;
				bucket.tokensPerDecision = tally.tokens / bucket.decided;
			}
		}
		if (tally && tally.stages > 0) bucket.meanStageDurationMs = tally.duration / tally.stages;
	}

	// Fairness now: the gate's DecidedCases over the window, each metric with its interval, greyed until the window fills.
	const cases: DecidedCase[] = [];
	for (const entry of windowed) {
		const truth = truthOfRun(entry);
		const group = (cohortOf(truth) ?? cohortOf(entry.item.truth))?.[across];
		const decision = decisionOf([...entry.agentEvents, ...entry.run.events], truth);
		if (group === undefined || !decision) continue;
		cases.push({
			group,
			decision: decision.outcome,
			verdict: decision.verdict,
			repaid: decision.repaid
		});
	}
	const groups = [...new Set(cases.map((c) => c.group))].sort();
	const fairness: MonitorFairnessRow[] = metrics.map((metric) => {
		if (groups.length < 2) {
			return {
				metric,
				across,
				n: cases.length,
				groups,
				rates: {},
				underpowered: true,
				reason: 'fewer than two cohorts with a decision'
			};
		}
		const result = fairnessMetric(metric, cases);
		return {
			metric,
			across,
			value: result.value,
			interval: [result.interval[0], result.interval[1]],
			n: cases.length,
			groups: result.groups,
			rates: result.rates,
			underpowered: result.underpowered || !windowFull
		};
	});

	// Drift now: PSI of the window's outcome mix against the population's expected verdicts.
	const current = windowed
		.map((entry) => factOf(entry).outcome)
		.filter((outcome): outcome is Decision => outcome !== undefined);
	const reference = options.reference?.verdicts ?? [];
	const drift: MonitorDriftRow[] =
		reference.length === 0
			? [{ feature: 'outcome-mix', flagged: false, reason: 'no reference to compare with' }]
			: current.length === 0
				? [{ feature: 'outcome-mix', flagged: false, reason: 'no decision in the window yet' }]
				: [
						(() => {
							const psi = psiCategorical(reference, current);
							return { feature: 'outcome-mix', psi, flagged: psi.reading !== 'stable' };
						})()
					];

	// Queues per desk: arrived, done, in progress inferred from concurrency, the oldest waiting item's age.
	const doneIds = new Set(ordered.map((entry) => entry.item.id));
	const deskIds =
		options.desks?.map((desk) => desk.id) ??
		[...new Set([...arrivals.map((a) => a.desk), ...ordered.map((e) => e.desk)])]
			.filter((id): id is string => id !== undefined)
			.sort();
	const queues: MonitorQueue[] = deskIds.map((deskId) => {
		const concurrency = options.desks?.find((desk) => desk.id === deskId)?.concurrency ?? 1;
		const mine = arrivals.filter((a) => a.desk === deskId).sort((a, b) => a.at.localeCompare(b.at));
		const done = ordered.filter((entry) => entry.desk === deskId).length;
		const open = mine.filter((a) => !doneIds.has(a.itemId));
		const inProgress = Math.min(concurrency, open.length);
		const waiting = open.length - inProgress;
		const oldest = open[inProgress];
		return {
			desk: deskId,
			arrived: mine.length,
			waiting,
			inProgress,
			done,
			...(oldest && now !== undefined
				? {
						oldestWaitingMinutes: Math.max(
							0,
							Math.round((Date.parse(now) - Date.parse(oldest.at)) / 60_000)
						)
					}
				: {})
		};
	});

	return { now, windowFull, readouts, buckets, fairness, drift, incidents, queues };
}
