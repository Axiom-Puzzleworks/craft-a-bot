import { createSession, type EngineEvent, type Guardrail } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient, turn } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildRegistry, buildSpec, runToCompletion } from './harness.js';

/**
 * WP3's second definition-of-done clause: "every event type observed in a
 * captured trace fixture". The catalogue is 02-AGENT-MODEL.md §7, and hard rule
 * 3 says anything the UI displays must come from one of these — so if a type
 * here is never produced, some future screen has nothing to render from.
 */

const EVENT_CATALOGUE = [
	'run.started',
	'run.finished',
	'tick.started',
	'tick.completed',
	'sense',
	'prompt.composed',
	'think.started',
	'think.token',
	'think.completed',
	'decision',
	'tool.executed',
	'action.performed',
	'memory.updated',
	'guardrail.checked',
	'guardrail.tripped',
	'approval.requested',
	'approval.resolved',
	'world.changed',
	'error'
] as const;

const SAY_HELLO_PLAN = [
	{ say: 'I should look for Teddy. Let me head east.', call: 'move', args: { direction: 'east' } },
	{ say: 'Still going east.', call: 'move', args: { direction: 'east' } },
	{ say: 'I can see Teddy now.', call: 'move', args: { direction: 'east' } },
	{
		say: 'Close enough to say hello!',
		call: 'say',
		args: { text: 'Hello Teddy, I am your new robot!' }
	}
];

/** The canonical run that gets captured to disk. */
export function runSayHello(): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const session = createSession({
		spec: buildSpec({ goalCardId: 'starter/say-hello' }),
		registry: buildRegistry(),
		provider: createMockProvider({ script: obedient(SAY_HELLO_PLAN) }),
		guardrails: [],
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});

	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));

	return (async () => {
		session.start('step');
		for (let step = 0; step < 10; step++) {
			const result = await session.step();
			if (result.outcome) break;
		}
		return events;
	})();
}

describe('the captured trace fixture', () => {
	it('matches the committed fixture exactly', async () => {
		const events = await runSayHello();

		/*
		 * A file snapshot rather than a hand-maintained JSON import, so the golden
		 * file has an honest way to be refreshed:
		 *
		 *     npx vitest run -u --root packages/packs/starter
		 *
		 * It legitimately changes whenever the prompt or the event payloads do —
		 * it changed when the memory window started storing the short form of an
		 * observation instead of the whole thing. Without a documented refresh,
		 * the temptation is to hand-edit the JSON until the diff goes away, which
		 * defeats the point of capturing a real run.
		 *
		 * `toMatchFileSnapshot` is also why this file needs no Node APIs: this is
		 * a browser-targeted pack, and pulling in `@types/node` to write a fixture
		 * would invite Node calls into pack source that cannot run in a browser.
		 */
		await expect(JSON.stringify(events, null, '	')).toMatchFileSnapshot(
			'../fixtures/trace.say-hello.v1.json'
		);
	});

	it('reproduces byte-identically on a second run', async () => {
		const first = await runSayHello();
		const second = await runSayHello();
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
	});

	it('carries a monotonic tick and one shared runId', async () => {
		const events = await runSayHello();
		const runIds = new Set(events.map((event) => event.runId));
		expect(runIds.size).toBe(1);

		const ticks = events.map((event) => event.tick);
		expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
	});

	it('never leaks anything key-shaped into the trace', async () => {
		const serialised = JSON.stringify(await runSayHello());
		expect(serialised).not.toMatch(/sk-[A-Za-z0-9]/);
		expect(serialised).not.toMatch(/apiKey/i);
	});
});

describe('the event catalogue (02-AGENT-MODEL.md §7)', () => {
	it('produces every one of the nineteen event types across the scripted runs', async () => {
		const seen = new Set<string>();
		for (const events of await gatherAllEventTypes()) {
			for (const event of events) seen.add(event.type);
		}

		const missing = EVENT_CATALOGUE.filter((type) => !seen.has(type));
		expect(missing, `event types never emitted: ${missing.join(', ')}`).toEqual([]);
	});

	it('emits nothing outside the catalogue', async () => {
		const seen = new Set<string>();
		for (const events of await gatherAllEventTypes()) {
			for (const event of events) seen.add(event.type);
		}
		const unexpected = [...seen].filter(
			(type) => !EVENT_CATALOGUE.includes(type as (typeof EVENT_CATALOGUE)[number])
		);
		expect(unexpected).toEqual([]);
	});
});

/** Several small runs, between them touching every corner of the catalogue. */
async function gatherAllEventTypes(): Promise<EngineEvent[][]> {
	const traces: EngineEvent[][] = [];

	// A complete, successful run: most of the catalogue.
	traces.push(await runSayHello());

	// A tool call, for tool.executed.
	const withTool = await runToCompletion({
		script: obedient([
			{ say: 'Let me work that out.', call: 'calculator', args: { expression: '17 * 23' } }
		]),
		spec: buildSpec({ goalCardId: 'starter/sums-for-teddy', tools: ['starter/calculator'] }),
		maxTicks: 1
	});
	traces.push(withTool.events);

	// A tripped guardrail.
	const stopper: Guardrail = {
		id: 'test/stopper',
		name: 'Stopper',
		description: 'Stops everything.',
		hooks: ['pre-think'],
		check: () => ({ allow: false, reason: 'Not today.', disposition: 'stop-run' })
	};
	traces.push((await runToCompletion({ script: [], guardrails: [stopper] })).events);

	// A provider failure, for error.
	traces.push(
		(
			await runToCompletion({
				script: [],
				provider: {
					id: 'exploding',
					name: 'Exploding brain',
					keyRequirement: 'none',
					validateKey: () => Promise.resolve({ ok: false, message: 'no' }),
					chat: () => Promise.reject(new Error('boom'))
				}
			})
		).events
	);

	// An approval pause and its resolution.
	traces.push(await runWithApproval());

	return traces;
}

async function runWithApproval(): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const askFirst: Guardrail = {
		id: 'test/ask-first',
		name: 'Ask First',
		description: 'Pauses for human approval.',
		hooks: ['pre-act'],
		check: () => ({ pause: true, reason: 'Check with a grown-up.' })
	};

	const session = createSession({
		spec: buildSpec({ goalCardId: 'starter/say-hello' }),
		registry: buildRegistry(),
		provider: createMockProvider({
			script: () => turn('East we go.', 'move', { direction: 'east' })
		}),
		guardrails: [askFirst],
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});

	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	const asked = new Promise<void>((resolve) => {
		session.events.on('approval.requested', () => resolve());
	});

	session.start('step');
	const pending = session.step();
	await asked;
	session.resolveApproval(true);
	await pending;
	return events;
}
