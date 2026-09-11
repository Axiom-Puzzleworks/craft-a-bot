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
import { createMemoryEvidenceInstance } from '@craftabot/evidence';
import { describe, expect, it } from 'vitest';
import { memorySink, runBank, type Arrival } from './bank.js';
import {
	bankRunsFromEvidence,
	evidenceMonitorSink,
	monitorRunsFromEvidence
} from './evidence-sink.js';

/**
 * **The seam, against the memory store** (WP84, `75-THE-MONITOR.md` §6–§7):
 * a day through the evidence sink lands every workflow run, every agent
 * run as a bundle and the `BankRun` in the store; the reader pulls the runs
 * back by date with their events attached and the desk from the `BankRun`;
 * a `BankRun` round-trips byte-equal; a day outside the window pulls nothing.
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
	next: () => 'end'
};
const VISIT: WorkflowSpec = {
	id: 'test/visit',
	name: 'A visit',
	worldId: TEST_DESK_ID,
	purpose: 'Sign a visitor in',
	intake: (item) => ({ layoutId: 'one-visitor', input: item.payload }),
	stages: [signIn],
	first: 'sign-in',
	obligations: [],
	configurations: { bot: {} }
};
const item = (n: number): WorkItem => ({
	id: `item-${n}`,
	kind: 'application',
	customerId: `customer-${n}`,
	arrivedAt: `2026-01-05T09:${String(n).padStart(2, '0')}:00.000Z`,
	payload: { visitor: 'A. Person' },
	truth: { records: [] }
});
async function* clockOf(items: WorkItem[]): AsyncIterable<Arrival> {
	for (const [ordinal, entry] of items.entries())
		yield { at: entry.arrivedAt, ordinal, item: entry };
}

describe('the evidence-store MonitorSink', () => {
	it('lands the day in the store and reads it back by date, events attached, the BankRun equal with its digest', async () => {
		const store = createMemoryEvidenceInstance({
			workspace: 'monitor-test',
			rows: new Map(),
			now: () => Date.parse('2026-09-11T10:00:00.000Z')
		});
		const kept = memorySink();
		const sink = evidenceMonitorSink(store, {
			principal: 'tester',
			now: () => Date.parse('2026-09-11T10:00:00.000Z')
		});
		const items = [item(0), item(1), item(2)];
		const options = {
			packs: [PACK],
			workflows: [VISIT],
			specFor: () => SPEC,
			providerFor: () => createMockProvider({ script: obedient(PLAN) }),
			seed: 1,
			clock: {
				from: '2026-01-05',
				to: '2026-01-05',
				seed: 1,
				acceleration: 'Infinity' as const,
				books: []
			},
			newId: () => 'bank-1'
		};
		const desks = [
			{
				id: 'front',
				workflowId: 'test/visit',
				kinds: ['application' as const],
				configuration: 'bot',
				concurrency: 1,
				build: 'clerk'
			}
		];
		const record = await runBank(
			clockOf(items),
			desks,
			{
				workflowRun: async (entry) => {
					kept.workflowRun(entry);
					await sink.workflowRun(entry);
				},
				agentRun: async (entry) => {
					kept.agentRun(entry);
					await sink.agentRun(entry);
				},
				bankRun: (bank) => sink.bankRun(bank)
			},
			options
		);
		const pulled = await collect(
			monitorRunsFromEvidence(store, { from: '2026-01-05', to: '2026-01-05' })
		);
		expect(pulled.map((entry) => entry.run.id).sort()).toEqual(
			kept.workflowRuns.map((entry) => entry.run.id).sort()
		);
		for (const entry of pulled) {
			expect(entry.desk).toBe('front');
			expect(entry.item.kind).toBe('application');
			const original = kept.workflowRuns.find((candidate) => candidate.run.id === entry.run.id);
			expect(entry.run).toEqual(original?.run);
			expect(entry.run.digest).toBe(original?.run.digest);
			const events = kept.agentRuns
				.filter((agentRun) => entry.run.runIds.includes(agentRun.runId))
				.flatMap((agentRun) => agentRun.events);
			expect(entry.agentEvents.length).toBe(events.length);
			expect(entry.agentEvents.map((event) => event.type)).toEqual(
				events.map((event) => event.type)
			);
		}
		const banks = await bankRunsFromEvidence(store);
		expect(banks).toHaveLength(1);
		expect(banks[0]).toEqual(record);
		expect(banks[0]?.digest).toBe(record.digest);
		// Every pushed item names its pusher and verifies.
		for await (const stored of store.pull({})) {
			expect(stored.pushedBy).toBe('tester');
			expect(stored.pushedAt).toBe('2026-09-11T10:00:00.000Z');
		}
		expect(
			await collect(monitorRunsFromEvidence(store, { from: '2026-01-06', to: '2026-01-06' }))
		).toEqual([]);
	});
});

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = [];
	for await (const entry of source) out.push(entry);
	return out;
}
