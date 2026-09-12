import type {
	AgentSpec,
	DeskWorldState,
	PackManifest,
	StageSpec,
	WorkItem,
	WorkflowSpec
} from '@craftabot/core';
import { createMockProvider, obedient, v1BrickKinds } from '@craftabot/core/testing';
import { TEST_DESK_ID, testDesk } from '@craftabot/desk/testing';
import { touchesPerCase, unattendedRate, wilson } from '@craftabot/metrics';
import { memorySink, runBank, touchedCaseOf, type Arrival } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { foldMonitor, referenceFromItems, type MonitorRun } from './monitor.js';

/**
 * **The fold over the test desk** (WP84, `75-THE-MONITOR.md` §7): a day of
 * visits worked by `runBank` into a memory sink, folded — the human-load
 * readouts equal the metrics over `touchedCaseOf` (the report's own fold),
 * the buckets fall in the day's hours, the fold is a pure function, the
 * window greys the fairness pane until it fills, a stopped run is an
 * incident with the workflow run beside it, an unrouted arrival waits in no
 * queue, and no reference leaves drift honest about it. The lending desk's
 * cross-check against the report is in `fs-lending/src/monitor.test.ts`.
 */
const PACK: PackManifest = {
	id: 'test',
	name: 'Test desk pack',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	worlds: [testDesk],
	brickKinds: v1BrickKinds(),
	cartridges: [
		{
			id: 'test/brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock brain',
			blurb: 'Scripted.',
			stats: { words: 1, reasoning: 1, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 64 }
		}
	]
};

const SPEC: AgentSpec = {
	id: '33333333-3333-4333-8333-333333333333',
	name: 'Deskbot',
	bricks: {
		llm: { cartridgeId: 'test/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['conversation', 'case-file', 'queue'] },
		actions: { enabled: ['say', 'look-up', 'sign-in'] },
		memory: { windowSize: 10, notebook: false }
	},
	goalCardId: 'test/sign-in',
	createdAt: '2026-09-05T09:00:00Z',
	updatedAt: '2026-09-05T09:00:00Z',
	schemaVersion: 1
};

const PLAN = [
	{ say: 'Hello.', call: 'say', args: { text: 'Hello, who are you here to see?' } },
	{ say: 'Opening the record.', call: 'look-up', args: { record: 'visitor' } },
	{ say: 'Signing in.', call: 'sign-in', args: { visitor: 'A. Person' } }
];

const signIn: StageSpec = {
	id: 'sign-in',
	name: 'Sign in',
	input: { type: 'object' },
	output: { type: 'object', required: ['signedIn'] },
	executor: { kind: 'agent', until: 'signed-in' },
	read: (state) =>
		(state as DeskWorldState).queue[0]?.status === 'decided' ? { signedIn: true } : undefined,
	next: () => 'confirm'
};
const confirm: StageSpec = {
	id: 'confirm',
	name: 'Confirm',
	input: { type: 'object' },
	output: { type: 'object', required: ['decision'] },
	executor: { kind: 'human', prompt: 'Let them through?', options: ['yes', 'no'] },
	next: () => 'end'
};
const VISIT: WorkflowSpec = {
	id: 'test/visit',
	name: 'A visit',
	worldId: TEST_DESK_ID,
	purpose: 'Sign a visitor in',
	intake: (item) => ({ layoutId: 'one-visitor', input: item.payload }),
	stages: [signIn, confirm],
	first: 'sign-in',
	obligations: [],
	configurations: {
		bot: {},
		refuse: { executors: { 'sign-in': { kind: 'rule', rule: 'missing' } } }
	}
};

const item = (n: number, kind: WorkItem['kind'] = 'application'): WorkItem => ({
	id: `item-${n}`,
	kind,
	customerId: `customer-${n}`,
	arrivedAt: `2026-01-05T${String(9 + Math.floor(n / 4)).padStart(2, '0')}:${String((n % 4) * 15).padStart(2, '0')}:00.000Z`,
	payload: { visitor: 'A. Person' },
	truth: { records: [], facts: { verdict: n % 3 === 0 ? 'should-refer' : 'should-approve' } }
});

async function* clockOf(items: WorkItem[]): AsyncIterable<Arrival> {
	for (const [ordinal, entry] of items.entries())
		yield { at: entry.arrivedAt, ordinal, item: entry };
}

async function day(items: WorkItem[], configuration = 'bot') {
	const sink = memorySink();
	const arrivals: Array<{ desk?: string; itemId: string; kind: WorkItem['kind']; at: string }> = [];
	const record = await runBank(
		clockOf(items),
		[
			{
				id: 'front',
				workflowId: 'test/visit',
				kinds: ['application'],
				configuration,
				concurrency: 2,
				build: 'clerk'
			}
		],
		sink,
		{
			packs: [PACK],
			workflows: [VISIT],
			specFor: () => SPEC,
			providerFor: () => createMockProvider({ script: obedient(PLAN) }),
			seed: 1,
			clock: { from: '2026-01-05', to: '2026-01-05', seed: 1, acceleration: 'Infinity', books: [] },
			newId: () => 'bank-1',
			onArrival: (arrival, desk) =>
				arrivals.push({
					...(desk !== undefined ? { desk } : {}),
					itemId: arrival.item.id,
					kind: arrival.item.kind,
					at: arrival.at
				})
		}
	);
	const runs: MonitorRun[] = sink.workflowRuns.map((entry) => ({
		...entry,
		agentEvents: sink.agentRuns
			.filter((agentRun) => entry.run.runIds.includes(agentRun.runId))
			.flatMap((agentRun) => agentRun.events)
	}));
	return { record, runs, arrivals };
}

describe('foldMonitor', () => {
	it('reads the human load as the report does, buckets by the simulated hour, and is a pure function', async () => {
		const items = Array.from({ length: 12 }, (_, n) => item(n));
		const { runs, arrivals } = await day(items);
		const options = {
			from: '2026-01-05',
			to: '2026-01-05',
			arrivals,
			desks: [{ id: 'front', concurrency: 2 }]
		};
		const state = foldMonitor(runs, options);
		const touched = runs
			.slice()
			.sort(
				(a, b) => a.run.startedAt.localeCompare(b.run.startedAt) || a.run.id.localeCompare(b.run.id)
			)
			.map((entry) => touchedCaseOf(entry.run));
		expect(state.readouts.runs).toBe(12);
		expect(state.readouts.touchesPerCase.value).toBe(touchesPerCase(touched).value);
		expect(state.readouts.touchesPerCase.byKind).toEqual(touchesPerCase(touched).detail ?? {});
		expect(state.readouts.unattendedRate.value).toBe(unattendedRate(touched).value);
		// A person confirms every visit: one touch each, nothing unattended.
		expect(state.readouts.touchesPerCase.value).toBe(1);
		expect(state.readouts.unattendedRate.value).toBe(0);
		expect(state.readouts.arrivals).toEqual({ application: 12 });
		expect(state.readouts.approvalRate.interval).toEqual([...wilson(0, 0)]);
		expect(state.buckets).toHaveLength(24);
		expect(state.buckets[9]?.runs).toBe(4);
		expect(state.buckets[10]?.runs).toBe(4);
		expect(state.buckets[11]?.runs).toBe(4);
		expect(state.buckets[9]?.label).toBe('2026-01-05 09:00');
		expect(state.buckets[9]?.arrivals).toEqual({ application: 4 });
		expect(state.readouts.tokens).toBeGreaterThan(0);
		expect(state.queues).toEqual([
			{ desk: 'front', arrived: 12, waiting: 0, inProgress: 0, done: 12 }
		]);
		expect(state.incidents).toEqual([]);
		expect(state.windowFull).toBe(false);
		expect(state.fairness.every((row) => row.underpowered)).toBe(true);
		expect(state.drift[0]).toMatchObject({ feature: 'outcome-mix', flagged: false });
		expect(state.drift[0]?.reason).toContain('no reference');
		// Pure: the same runs in another order fold to the same state.
		expect(foldMonitor([...runs].reverse(), options)).toEqual(state);
		// The window: the last four runs only.
		const windowed = foldMonitor(runs, { ...options, window: 4, minimum: 4 });
		expect(windowed.readouts.runs).toBe(4);
		expect(windowed.windowFull).toBe(true);
	});

	it('lists a stopped run as an incident beside its workflow run, and leaves an unrouted arrival in no queue', async () => {
		const items = [item(0), item(1, 'alert'), item(2)];
		const { runs, arrivals, record } = await day(items, 'refuse');
		expect(record.counts.unrouted).toBe(1);
		const state = foldMonitor(runs, { from: '2026-01-05', to: '2026-01-05', arrivals });
		expect(state.incidents).toHaveLength(2);
		expect(state.incidents[0]).toMatchObject({
			itemId: 'item-0',
			desk: 'front',
			stageId: 'sign-in',
			status: 'error',
			findings: []
		});
		expect(state.incidents[0]?.workflowRunId).toBe(
			runs.find((r) => r.item.id === 'item-0')?.run.id
		);
		expect(state.readouts.incidentsOpen).toBe(2);
		expect(state.readouts.arrivals).toEqual({ application: 2, alert: 1 });
		expect(state.queues).toEqual([
			{ desk: 'front', arrived: 2, waiting: 0, inProgress: 0, done: 2 }
		]);
	});

	it('infers the queue from arrivals not yet worked, ages the oldest waiting item on the simulated clock, and reads the reference from the items', () => {
		const items = Array.from({ length: 6 }, (_, n) => item(n));
		const arrivals = items.map((entry) => ({
			desk: 'front',
			itemId: entry.id,
			kind: entry.kind,
			at: entry.arrivedAt
		}));
		const state = foldMonitor([], {
			from: '2026-01-05',
			to: '2026-01-05',
			arrivals,
			desks: [{ id: 'front', concurrency: 2 }],
			now: '2026-01-05T10:00:00.000Z',
			reference: referenceFromItems(items)
		});
		// Six arrived, none done: two in the lanes, four waiting; the oldest waiting is the third (09:30), thirty minutes ago.
		expect(state.queues).toEqual([
			{ desk: 'front', arrived: 6, waiting: 4, inProgress: 2, done: 0, oldestWaitingMinutes: 30 }
		]);
		expect(state.now).toBe('2026-01-05T10:00:00.000Z');
		expect(state.drift[0]?.reason).toContain('no decision');
		const reference = referenceFromItems(items);
		expect(reference.verdicts).toEqual([
			'refer',
			'approve',
			'approve',
			'refer',
			'approve',
			'approve'
		]);
		expect(reference.approvalRate).toBeCloseTo(4 / 6);
		expect(referenceFromItems([])).toEqual({});
	});
});
