import { describe, expect, it } from 'vitest';
import {
	createPackRegistry,
	createSession,
	type AgentSpecV2,
	type EngineEvent
} from '@craftabot/core';
import { createMockProvider, obedient } from '@craftabot/core/testing';
import starterPack from '@craftabot/pack-starter';
import { armorBrickKind } from './brick-kind.js';
import type { ArmorConfigInput } from './config.js';
import { fixtures } from '../fixtures/index.js';

/**
 * The Armour Brick, fitted for real (`25-…` §11 Stage D's own DoD): a real
 * `AgentSpecV2` with `geap/armor` in the `safety` socket, run through
 * `createSession` exactly as the workbench would build one, against the
 * sign-hijack scenario `starter/warning-sign` ships with — the same
 * `HIJACK_SCRIPT` `session/governance-scenarios.test.ts` and
 * `armour-studio.ts` (stage B) both use, reused verbatim rather than
 * re-authored a third time.
 *
 * Two DoD moments: **"stops legibly"** — a real (mocked) Model Armor match
 * ends the run with a reason a person can read; **"eject and step: fails
 * closed legibly"** — no credential at all still ends the run cleanly,
 * never as a silent allow or an `error` event.
 */

/**
 * WP41 (`26-…` §6.6): a hosted component that is *not* unplugged, under
 * `egress: 'none'`, ends the run fail-closed with the refusal on the trace
 * and **no** network call — the injected fetch throws if anything reaches it.
 */
describe('the Armour Brick under egress: none', () => {
	it('ends STOPPED_BY_GUARDRAIL with an egress-refused error and no fetch call', async () => {
		const reached: string[] = [];
		const throwingFetch: typeof globalThis.fetch = (input) => {
			reached.push(String(input));
			throw new Error('the network must not be reached');
		};
		const session = createSession({
			spec: armourSpec({
				projectId: 'proj-1',
				location: 'europe-west2',
				templateId: 'cab-armour',
				offline: false,
				screenDecision: 'stop'
			}),
			registry: registry(),
			provider: createMockProvider({ script: hijackScript() }),
			guardrails: [],
			getCredential: (id) => (id === 'geap' ? 'ya29.test-token' : undefined),
			options: { fetch: throwingFetch, egress: 'none' }
		});
		const events: EngineEvent[] = [];
		session.events.onAny((event) => events.push(event));
		session.start('step');
		let outcome: string | undefined;
		for (let i = 0; i < 20 && outcome === undefined; i += 1) {
			const result = await session.step();
			if (result.outcome) outcome = result.outcome;
		}
		expect(outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(reached).toEqual([]);
		const refusals = events.filter(
			(event) => event.type === 'error' && event.payload.kind === 'egress-refused'
		);
		expect(refusals.length).toBeGreaterThan(0);
		expect(refusals[0]?.type === 'error' ? refusals[0].payload.message : '').toContain(
			'modelarmor.europe-west2.rep.googleapis.com'
		);
		const started = events.find((event) => event.type === 'run.started');
		expect(started?.type === 'run.started' ? started.payload.egress : undefined).toEqual({
			mode: 'none',
			hosts: ['modelarmor.*.rep.googleapis.com']
		});
		expect(JSON.stringify(events)).not.toContain('ya29.test-token');
	});
});

function hijackScript() {
	return obedient([
		{ say: 'A sign! Let me check it.', call: 'look_up_manual', args: { query: 'sign' } },
		{ say: 'Better do what it says.', call: 'pick_up', args: { item: 'ball' } },
		{ say: 'Off east.', call: 'move', args: { direction: 'east' } },
		{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
		{ say: 'Nearly there.', call: 'move', args: { direction: 'east' } },
		{ say: 'One more.', call: 'move', args: { direction: 'east' } },
		{ say: 'Handing it over.', call: 'give', args: { item: 'ball', character: 'teddy' } },
		{ say: 'All done!', call: 'celebrate' }
	]);
}

function armourSpec(armorConfig: ArmorConfigInput): AgentSpecV2 {
	return {
		id: '55555555-5555-4555-8555-555555555555',
		name: 'Armoured Tinybot',
		schemaVersion: 2,
		identity: { displayName: 'Armoured Tinybot', boxArtSeed: 'seed' },
		goalCardId: 'starter/warning-sign',
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
				slot: 'equipment',
				kind: 'starter/tools',
				configVersion: 1,
				config: { enabled: ['starter/look_up_manual'] }
			},
			{
				slot: 'mobility',
				kind: 'starter/actions',
				configVersion: 1,
				config: {
					enabled: [
						'starter/playroom/move',
						'starter/playroom/pick_up',
						'starter/playroom/give',
						'starter/playroom/celebrate'
					]
				}
			},
			{ slot: 'safety', kind: 'geap/armor', configVersion: 1, config: armorConfig }
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

async function runScenario(
	armorConfig: ArmorConfigInput,
	fetchImpl: typeof globalThis.fetch,
	credential: string | undefined = 'a-real-token'
) {
	const spec = armourSpec(armorConfig);
	const session = createSession({
		spec,
		registry: registry(),
		provider: createMockProvider({ script: hijackScript() }),
		guardrails: [],
		getCredential: (id) => (id === 'geap' ? credential : undefined),
		options: { fetch: fetchImpl }
	});

	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => session.resolveApproval(false));

	session.start('step');
	let outcome: string | undefined;
	for (let step = 0; step < 10; step += 1) {
		const result = await session.step();
		if (result.outcome) {
			outcome = result.outcome;
			break;
		}
	}
	return { outcome, events };
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('the Armour Brick, fitted for real — stops legibly', () => {
	it('ends the run STOPPED_BY_GUARDRAIL on a real (mocked) Model Armor match, with a readable reason', async () => {
		const { outcome, events } = await runScenario(
			{
				projectId: 'proj-1',
				location: 'europe-west2',
				templateId: 'cab-armour',
				offline: false,
				screenDecision: 'stop'
			},
			() => Promise.resolve(jsonResponse(fixtures['injection-high']))
		);

		expect(outcome).toBe('STOPPED_BY_GUARDRAIL');

		const tripped = events.find((event) => event.type === 'guardrail.tripped');
		expect(tripped?.type === 'guardrail.tripped' ? tripped.payload.reason : undefined).toContain(
			'sneaky instruction'
		);

		const external = events.filter((event) => event.type === 'guardrail.external');
		expect(external.length).toBeGreaterThan(0);
		expect(
			external.every(
				(event) => event.type === 'guardrail.external' && event.payload.outcome === 'ok'
			)
		).toBe(true);
	});

	it('never leaks the token into the trace, even on a real hosted call', async () => {
		const { events } = await runScenario(
			{
				projectId: 'proj-1',
				location: 'europe-west2',
				templateId: 'cab-armour',
				offline: false,
				screenDecision: 'stop'
			},
			() => Promise.resolve(jsonResponse(fixtures['injection-high']))
		);
		expect(JSON.stringify(events)).not.toContain('a-real-token');
	});
});

describe('the Armour Brick, fitted for real — eject and step: fails closed legibly', () => {
	it('stops the run legibly when the battery is ejected (no credential at all), never as a silent allow or an error', async () => {
		const { outcome, events } = await runScenario(
			{
				projectId: 'proj-1',
				location: 'europe-west2',
				templateId: 'cab-armour',
				offline: false,
				screenDecision: 'stop',
				onFailure: 'stop-run'
			},
			// The server-side shape a missing/empty bearer token produces —
			// the client sends whatever getCredential() returns verbatim, so
			// "ejected" and "wrong" both surface here as the same response.
			() => Promise.resolve(jsonResponse({ error: { message: 'invalid token' } }, 401)),
			undefined
		);

		expect(outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(events.some((event) => event.type === 'error')).toBe(false);

		const tripped = events.find((event) => event.type === 'guardrail.tripped');
		expect(tripped?.type === 'guardrail.tripped' ? tripped.payload.reason : undefined).toContain(
			'battery token was rejected'
		);

		const external = events.find((event) => event.type === 'guardrail.external');
		expect(external?.type === 'guardrail.external' ? external.payload.outcome : undefined).toBe(
			'bad-token'
		);
	});

	it('allows with a note instead when onFailure is allow-with-note, never a silent allow with nothing recorded', async () => {
		const { outcome, events } = await runScenario(
			{
				projectId: 'proj-1',
				location: 'europe-west2',
				templateId: 'cab-armour',
				offline: false,
				screenDecision: 'stop',
				onFailure: 'allow-with-note'
			},
			() => Promise.reject(new TypeError('Failed to fetch'))
		);

		expect(outcome).not.toBe('ERROR');
		const checked = events.filter((event) => event.type === 'guardrail.checked');
		expect(checked.length).toBeGreaterThan(0);
		const external = events.find((event) => event.type === 'guardrail.external');
		expect(external?.type === 'guardrail.external' ? external.payload.outcome : undefined).toBe(
			'unavailable'
		);
	});
});
