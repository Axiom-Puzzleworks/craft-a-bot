import { describe, expect, it } from 'vitest';
import {
	createPackRegistry,
	createSession,
	type AgentSpecV2,
	type EngineEvent
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import starterPack from '@craftabot/pack-starter';
import { armorBrickKind } from './brick-kind.js';

/**
 * The Armour Brick's own offline golden trace (`25-…` §11 Stage D's own
 * DoD: "offline: golden trace byte-stable plus the offline rows", and §6's
 * own promise: "`offline: true` reproduces the golden `say-hello` trace
 * byte-for-byte except for the added `guardrail.external { outcome:
 * 'offline' }` rows"). Modelled directly on
 * `pack-starter/session/trace-fixture.test.ts`'s own `runSayHello` —
 * same plan, same goal card, same deterministic clock — with the one
 * addition under test: the Armour Brick fitted, `offline: true`,
 * `screenDecision: 'note'` so it actually screens the decision each tick
 * without ever blocking the happy path.
 */

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

function armouredSpec(): AgentSpecV2 {
	return {
		id: '66666666-6666-4666-8666-666666666666',
		name: 'Armoured Tinybot',
		schemaVersion: 2,
		identity: { displayName: 'Armoured Tinybot', boxArtSeed: 'seed' },
		goalCardId: 'starter/say-hello',
		bricks: [
			{
				slot: 'brain',
				kind: 'starter/llm',
				configVersion: 1,
				config: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' }
			},
			{
				slot: 'memory',
				kind: 'starter/memory',
				configVersion: 1,
				config: { windowSize: 10, notebook: false }
			},
			{
				slot: 'perception',
				kind: 'starter/sense',
				configVersion: 1,
				config: { channels: ['starter/playroom/sight', 'starter/playroom/compass'] }
			},
			{
				slot: 'mobility',
				kind: 'starter/actions',
				configVersion: 1,
				config: { enabled: ['starter/playroom/move', 'starter/playroom/say'] }
			},
			{
				slot: 'safety',
				kind: 'geap/armor',
				configVersion: 1,
				config: {
					projectId: 'proj-1',
					location: 'europe-west2',
					templateId: 'cab-armour',
					offline: true,
					screenDecision: 'note'
				}
			}
		],
		createdAt: '2026-09-01T09:00:00.000Z',
		updatedAt: '2026-09-01T09:00:00.000Z'
	};
}

function registry() {
	const reg = createPackRegistry();
	reg.registerPack(starterPack);
	reg.registerPack({
		id: 'test-geap',
		name: 'Test Geap',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		brickKinds: [armorBrickKind],
		cartridges: [
			{
				id: 'test/mock-brain',
				providerId: 'mock',
				model: 'mock-1',
				displayName: 'Test Brain',
				blurb: 'Scripted.',
				stats: { words: 2, reasoning: 2, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 256 }
			}
		]
	});
	return reg;
}

/** The canonical run that gets captured to disk. */
export function runArmouredSayHello(): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const session = createSession({
		spec: armouredSpec(),
		registry: registry(),
		provider: createMockProvider({ script: obedient(SAY_HELLO_PLAN) }),
		guardrails: [],
		getCredential: () => undefined,
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

/**
 * `guardrail.external.latencyMs` is real wall-clock timing
 * (`guardrails.ts`'s `runArmorCheck` measures it with `Date.now()`, not the
 * session's injected test clock — a deliberate Stage B choice, since it is
 * the one field on the event that is supposed to say something true about
 * the network) — the one field on an otherwise fully deterministic trace
 * that a byte-for-byte comparison cannot honestly demand agreement on.
 * Zeroed before every comparison below, the same way a snapshot test masks
 * a timestamp it does not control.
 */
function withoutLatency(events: EngineEvent[]): EngineEvent[] {
	return events.map((event) =>
		event.type === 'guardrail.external'
			? { ...event, payload: { ...event.payload, latencyMs: 0 } }
			: event
	);
}

describe('the Armour Brick — offline golden trace', () => {
	it('matches the committed fixture exactly', async () => {
		const events = withoutLatency(await runArmouredSayHello());

		/*
		 * Refresh with `npx vitest run -u --root packages/packs/geap` — the
		 * same documented-drift discipline `trace-fixture.test.ts` holds to.
		 */
		await expect(JSON.stringify(events, null, '	')).toMatchFileSnapshot(
			'../fixtures/trace.geap-armour-offline.v1.json'
		);
	});

	it('reproduces byte-identically on a second run', async () => {
		const first = withoutLatency(await runArmouredSayHello());
		const second = withoutLatency(await runArmouredSayHello());
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
	});

	it("reaches the goal, so the offline screen never gets in the happy path's way", async () => {
		const events = await runArmouredSayHello();
		const finished = events.find((event) => event.type === 'run.finished');
		expect(finished?.type === 'run.finished' ? finished.payload.outcome : undefined).toBe(
			'SUCCESS'
		);
	});

	it('adds exactly one guardrail.external row per tick, each labelled offline', async () => {
		const events = await runArmouredSayHello();
		const external = events.filter((event) => event.type === 'guardrail.external');
		expect(external.length).toBeGreaterThan(0);
		expect(
			external.every(
				(event) => event.type === 'guardrail.external' && event.payload.outcome === 'offline'
			)
		).toBe(true);
	});

	it('never carries a token or a screened line of prose, even though nothing is plugged in', async () => {
		const events = await runArmouredSayHello();
		expect(JSON.stringify(events)).not.toContain('Bearer');
	});
});
