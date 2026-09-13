import {
	bankRunSchema,
	type AgentSpec,
	type BankRun,
	type DeskWorldState,
	type PackManifest,
	type StageSpec,
	type WorkItem,
	type WorkflowSpec
} from '@craftabot/core';
import { createMockProvider, obedient, v1BrickKinds } from '@craftabot/core/testing';
import { TEST_DESK_ID, testDesk } from '@craftabot/desk/testing';
import { describe, expect, it } from 'vitest';
import { memorySink, runBank, type Arrival, type DeskAssignment } from './bank.js';

/**
 * **The scheduler** (WP83, `71-THE-CLOCK.md` §6): over the test desk with a
 * two-stage workflow — a bot signs the visitor in, a person confirms — a
 * day of arrivals is worked byte-identically across two runs and across
 * concurrency 1 and 4; every workflow run and agent run reaches the sink;
 * no item is worked twice; an unrouted kind is counted; a stopped run is
 * an incident; `stopAfter` leaves the rest counted and unworked.
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
	arrivedAt: `2026-01-05T09:${String(n % 60).padStart(2, '0')}:00.000Z`,
	payload: { visitor: 'A. Person' },
	truth: { records: [] }
});

async function* clockOf(items: WorkItem[]): AsyncIterable<Arrival> {
	for (const [ordinal, entry] of items.entries())
		yield { at: entry.arrivedAt, ordinal, item: entry };
}

const CLOCK: BankRun['clock'] = {
	from: '2026-01-05',
	to: '2026-01-05',
	seed: 1,
	acceleration: 'Infinity',
	books: [{ kind: 'application', items: 0 }]
};

function desk(concurrency: number, over: Partial<DeskAssignment> = {}): DeskAssignment {
	return {
		id: 'front',
		workflowId: 'test/visit',
		kinds: ['application'],
		configuration: 'bot',
		concurrency,
		build: 'clerk',
		...over
	};
}

async function day(desks: DeskAssignment[], items: WorkItem[], over: Record<string, unknown> = {}) {
	const sink = memorySink();
	const record = await runBank(clockOf(items), desks, sink, {
		packs: [PACK],
		workflows: [VISIT],
		specFor: () => SPEC,
		providerFor: () => createMockProvider({ script: obedient(PLAN) }),
		seed: 1,
		clock: CLOCK,
		populationDigest: 'pop-1',
		newId: () => 'bank-1',
		...over
	});
	return { record, sink };
}

describe('runBank', () => {
	it('works a day byte-identically across two runs and across concurrency 1 and 4, every run reaching the sink', async () => {
		const items = Array.from({ length: 12 }, (_, n) => item(n));
		const one = await day([desk(1)], items);
		const four = await day([desk(4)], items);
		const again = await day([desk(4)], items);
		expect(one.record.digest).toBe(four.record.digest);
		expect(four.record.digest).toBe(again.record.digest);
		expect(JSON.stringify(four.record.runs)).toBe(JSON.stringify(one.record.runs));
		expect(four.record.counts).toMatchObject({
			arrivals: { application: 12 },
			routed: 12,
			unrouted: 0,
			completed: 12,
			stopped: 0,
			byDesk: { front: { worked: 12, completed: 12, stopped: 0 } }
		});
		expect(four.sink.workflowRuns).toHaveLength(12);
		expect(four.sink.agentRuns).toHaveLength(12);
		expect(new Set(four.sink.workflowRuns.map((entry) => entry.item.id)).size).toBe(12);
		expect(four.sink.bankRuns).toHaveLength(1);
		expect(four.record.desks[0]).toMatchObject({
			id: 'front',
			configuration: 'bot',
			concurrency: 4
		});
		expect(four.record.startedAt).toBe(items[0]!.arrivedAt);
		expect(four.record.finishedAt).toBe(items[11]!.arrivedAt);
		expect(bankRunSchema.safeParse(JSON.parse(JSON.stringify(four.record))).success).toBe(true);
		// The runs are the same bytes whichever lane worked them: their ids come from the ordinal.
		const byItem = (sink: ReturnType<typeof memorySink>) =>
			Object.fromEntries(
				sink.workflowRuns.map((entry) => [entry.item.id, JSON.stringify(entry.run)])
			);
		expect(byItem(four.sink)).toEqual(byItem(one.sink));
	});

	it('counts an unrouted kind, records a stopped run as an incident, and stops taking after stopAfter', async () => {
		const items = [item(0), item(1, 'alert'), item(2), item(3), item(4)];
		const seen: string[] = [];
		const { record } = await day([desk(2, { configuration: 'refuse' })], items, {
			stopAfter: 2,
			onIncident: (incident: { itemId: string }) => seen.push(incident.itemId)
		});
		expect(record.counts).toMatchObject({
			arrivals: { application: 4, alert: 1 },
			unrouted: 1,
			routed: 2
		});
		expect(record.runs).toHaveLength(2);
		expect(record.counts.stopped).toBe(2);
		expect(record.incidents.map((incident) => incident.itemId)).toEqual(['item-0', 'item-2']);
		expect(record.incidents[0]).toMatchObject({
			desk: 'front',
			stageId: 'sign-in',
			status: 'error'
		});
		expect(seen).toEqual(['item-0', 'item-2']);
	});

	it('refuses a desk naming a workflow or a configuration it cannot find', async () => {
		await expect(day([desk(1, { workflowId: 'test/none' })], [item(0)])).rejects.toThrow(
			'not installed'
		);
		await expect(day([desk(1, { configuration: 'none' })], [item(0)])).rejects.toThrow(
			'does not have'
		);
	});
});

describe('a handoff on the clock (WP102, `83-…` §6.5.3)', () => {
	/** A journey whose one stage hands the visitor on as an alert for the second desk. */
	const REFER: WorkflowSpec = {
		...VISIT,
		id: 'test/refer',
		name: 'A referral',
		stages: [
			{
				id: 'refer',
				name: 'Refer',
				input: { type: 'object' },
				output: { type: 'object' },
				executor: { kind: 'rule', rule: 'refer-v1' },
				next: (_out, _state, input) => ({
					handoff: 'test/visit',
					item: { ...item(9, 'alert'), payload: { referred: input } }
				})
			}
		],
		first: 'refer',
		rules: { 'refer-v1': (input) => ({ output: { referred: input } }) },
		configurations: { bot: {} }
	};

	it('routes the handed-off item to the desk that takes its kind, and the day drains it before ending', async () => {
		const desks = [
			desk(1, { id: 'front', workflowId: 'test/refer', kinds: ['application'] }),
			desk(1, { id: 'alerts', workflowId: 'test/visit', kinds: ['alert'] })
		];
		const arrivals: Array<{ desk: string | undefined; kind: string }> = [];
		const { record } = await day(desks, [item(1)], {
			workflows: [VISIT, REFER],
			onArrival: (arrival: Arrival, to: string | undefined) =>
				arrivals.push({ desk: to, kind: arrival.item.kind })
		});
		expect(record.counts.handedOff).toBe(1);
		expect(record.counts.byDesk['front']?.handedOff).toBe(1);
		expect(record.counts.arrivals).toEqual({ application: 1, alert: 1 });
		expect(record.counts.routed).toBe(2);
		expect(arrivals).toEqual([
			{ desk: 'front', kind: 'application' },
			{ desk: 'alerts', kind: 'alert' }
		]);
		expect(record.runs.map((run) => [run.desk, run.outcome])).toEqual([
			['front', 'handed-off'],
			['alerts', 'completed']
		]);
		const follower = record.runs[1];
		expect(follower?.itemId).toBe('item-9');
		expect(follower?.ordinal).toBeGreaterThan(1_000_000);
	});

	it('counts a handed-off item nobody takes as unrouted work left on the clock', async () => {
		const { record } = await day([desk(1, { workflowId: 'test/refer' })], [item(1)], {
			workflows: [VISIT, REFER]
		});
		expect(record.counts.handedOff).toBe(1);
		expect(record.runs).toHaveLength(1);
	});
});
