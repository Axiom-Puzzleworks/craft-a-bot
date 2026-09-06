import { describe, expect, it } from 'vitest';
import { createSession } from './agent-session.js';
import { createSessionGroup } from './session-group.js';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import { createMockProvider, createTestClock, turn, v1BrickKinds } from '../testing/index.js';
import { buildTraceFile, verifyTraceDigest } from '../persistence/trace-export.js';
import { makeRun } from '../testing/storage-fixtures.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import type { Principal } from '../schemas/shared.js';
import type { Guardrail } from '../types/guardrail.js';
import type { AgentHandle, WorldDefinition, WorldInstance } from '../types/world.js';

/**
 * The principal on the trace (WP65, `55-PRINCIPAL.md` §11 items 1–4): a
 * session given one writes it on `run.started` and an attestation on every
 * `action.performed` naming the `pre-act` guardrails that allowed the call;
 * a session given none writes neither; an approval answered with a `by`
 * records it and the action names `approvedBy`; a group's members act
 * `onBehalfOf` the group's principal; the digest covers every field.
 */
const PERSON: Principal = { kind: 'person', id: 'browser-1', name: 'Sam' };
const SERVICE: Principal = { kind: 'service', id: 'craftabot-harness', name: 'ci' };

function createTinyWorld(id = 'tiny/world'): WorldDefinition {
	return {
		id,
		name: 'Tiny world',
		layouts: [{ id: 'only', name: 'Only layout', initialState: { rang: false } }],
		actions: [
			{ id: 'ring', name: 'Ring', description: 'Ring the bell.', parameters: { type: 'object' } },
			{ id: 'sit', name: 'Sit', description: 'Sit down.', parameters: { type: 'object' } }
		],
		senses: [{ id: 'look', name: 'Look', description: 'See the world.' }],
		predicates: { rang: 'The bell rang.' },
		create(): WorldInstance {
			const state = { rang: false };
			const instance: WorldInstance = {
				snapshot: () => ({ ...state }),
				observe: (channels) => ({ channels: [...channels], text: 'You see a bell.', data: {} }),
				perform: (action) => {
					if (action.name === 'ring') {
						state.rang = true;
						return { ok: true, narration: 'Ding.', stateDiff: [] };
					}
					return { ok: true, narration: 'You sit.', stateDiff: [] };
				},
				test: (predicate) => predicate === 'rang' && state.rang,
				reset: () => {
					state.rang = false;
				},
				forAgent: (handle: AgentHandle) => {
					void handle;
					return instance;
				}
			};
			return instance;
		}
	};
}

function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'tiny',
		name: 'Tiny pack',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		worlds: [createTinyWorld()],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'tiny/brain',
				providerId: 'mock',
				model: 'tiny-model-1',
				displayName: 'Tiny brain',
				blurb: 'Small.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'tiny/goal',
				title: 'Ring it',
				goalText: 'Ring the bell.',
				worldId: 'tiny/world',
				layoutId: 'only',
				successCondition: 'rang',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

function buildSpec(id = '11111111-1111-4111-8111-111111111111', name = 'Robo'): AgentSpec {
	return {
		id,
		name,
		bricks: {
			llm: { cartridgeId: 'tiny/brain', temperature: 0, maxTokens: 64, personality: '' },
			sense: { channels: ['look'] },
			actions: { enabled: ['ring', 'sit'] }
		},
		goalCardId: 'tiny/goal',
		createdAt: '2026-09-06T09:00:00.000Z',
		updatedAt: '2026-09-06T09:00:00.000Z',
		schemaVersion: 1
	};
}

const allowAll: Guardrail = {
	id: 'test/allow',
	name: 'Allow',
	description: 'Allows.',
	hooks: ['pre-act'],
	check: () => ({ allow: true })
};
const askFirst: Guardrail = {
	id: 'test/ask',
	name: 'Ask',
	description: 'Pauses for a person.',
	hooks: ['pre-act'],
	check: () => ({ pause: true, reason: 'ask first' })
};

function makeSession(config: {
	principal?: Principal;
	guardrails?: Guardrail[];
	script?: ReturnType<typeof turn>[];
}) {
	const clock = createTestClock();
	const log: EngineEvent[] = [];
	const session = createSession({
		spec: buildSpec(),
		registry: buildRegistry(),
		provider: createMockProvider({ script: config.script ?? [turn('Ring.', 'ring')] }),
		guardrails: config.guardrails ?? [],
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(config.principal ? { principal: config.principal } : {})
		}
	});
	session.events.onAny((event) => log.push(event));
	return { session, log };
}

describe('the principal on the trace (WP65)', () => {
	it('writes the principal on run.started and an attestation naming the guardrails that allowed the call', async () => {
		const { session, log } = makeSession({ principal: PERSON, guardrails: [allowAll] });
		await session.step();
		const started = log.find((event) => event.type === 'run.started');
		expect(started?.type === 'run.started' && started.payload.principal).toEqual(PERSON);
		const acted = log.find((event) => event.type === 'action.performed');
		expect(acted?.type === 'action.performed' && acted.payload.attestation).toEqual({
			principal: PERSON,
			guardrailsPassed: ['test/allow']
		});
	});

	it('writes neither when no principal was named — a trace written before keeps its bytes', async () => {
		const { session, log } = makeSession({ guardrails: [allowAll] });
		await session.step();
		const started = log.find((event) => event.type === 'run.started');
		expect(started?.type === 'run.started' && 'principal' in started.payload).toBe(false);
		const acted = log.find((event) => event.type === 'action.performed');
		expect(acted?.type === 'action.performed' && 'attestation' in acted.payload).toBe(false);
		const resolved = log.find((event) => event.type === 'approval.resolved');
		expect(resolved).toBeUndefined();
	});

	it('records who answered an approval, and the action it let through names approvedBy', async () => {
		const { session, log } = makeSession({ principal: SERVICE, guardrails: [allowAll, askFirst] });
		session.events.on('approval.requested', () => session.resolveApproval(true, PERSON));
		await session.step();
		const resolved = log.find((event) => event.type === 'approval.resolved');
		expect(resolved?.type === 'approval.resolved' && resolved.payload).toEqual({
			approved: true,
			by: PERSON
		});
		const acted = log.find((event) => event.type === 'action.performed');
		expect(acted?.type === 'action.performed' && acted.payload.attestation).toEqual({
			principal: SERVICE,
			approvedBy: PERSON,
			guardrailsPassed: ['test/allow']
		});
	});

	it('an approval answered without a by carries none, and a refusal names nobody in an attestation', async () => {
		const { session, log } = makeSession({ principal: SERVICE, guardrails: [askFirst] });
		session.events.on('approval.requested', () => session.resolveApproval(false));
		await session.step();
		const resolved = log.find((event) => event.type === 'approval.resolved');
		expect(resolved?.type === 'approval.resolved' && resolved.payload).toEqual({ approved: false });
		expect(log.some((event) => event.type === 'action.performed')).toBe(false);
	});

	it('a group with a principal writes it on group.started, and each member acts onBehalfOf it', async () => {
		const clock = createTestClock();
		const log: EngineEvent[] = [];
		const group = createSessionGroup({
			members: [
				{
					spec: buildSpec('11111111-1111-4111-8111-111111111111', 'Robo'),
					provider: createMockProvider({ script: [turn('Ring.', 'ring')] })
				},
				{
					spec: buildSpec('22222222-2222-4222-8222-222222222222', 'Bolt'),
					provider: createMockProvider({ script: [turn('Sit.', 'sit')] })
				}
			],
			registry: buildRegistry(),
			goalCardId: 'tiny/goal',
			options: { now: clock.now, newId: clock.newId, random: clock.random, principal: PERSON }
		});
		group.events.onAny((event) => log.push(event));
		group.start('step');
		await group.stepRound();
		const groupStarted = log.find((event) => event.type === 'group.started');
		expect(groupStarted?.type === 'group.started' && groupStarted.payload.principal).toEqual(
			PERSON
		);
		const memberStarts = log.filter((event) => event.type === 'run.started');
		expect(
			memberStarts.map((event) => event.type === 'run.started' && event.payload.principal)
		).toEqual([
			{
				kind: 'agent',
				id: '11111111-1111-4111-8111-111111111111',
				name: 'Robo',
				onBehalfOf: PERSON
			},
			{
				kind: 'agent',
				id: '22222222-2222-4222-8222-222222222222',
				name: 'Bolt',
				onBehalfOf: PERSON
			}
		]);
		const acted = log.find((event) => event.type === 'action.performed');
		expect(
			acted?.type === 'action.performed' && acted.payload.attestation?.principal.onBehalfOf
		).toEqual(PERSON);
	});

	it('a group without a principal writes none anywhere', async () => {
		const clock = createTestClock();
		const log: EngineEvent[] = [];
		const group = createSessionGroup({
			members: [
				{ spec: buildSpec(), provider: createMockProvider({ script: [turn('Ring.', 'ring')] }) }
			],
			registry: buildRegistry(),
			goalCardId: 'tiny/goal',
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		group.events.onAny((event) => log.push(event));
		group.start('step');
		await group.stepRound();
		expect(log.some((event) => 'principal' in event.payload)).toBe(false);
	});

	it('the digest covers it: a flipped by or a changed principal fails verification', async () => {
		const { session, log } = makeSession({ principal: SERVICE, guardrails: [askFirst] });
		session.events.on('approval.requested', () => session.resolveApproval(true, PERSON));
		await session.step();
		const trace = await buildTraceFile(makeRun({ id: log[0]!.runId }), log);
		await expect(verifyTraceDigest(trace)).resolves.toBe(true);
		const flipped = {
			...trace,
			events: trace.events.map((event) =>
				event.type === 'approval.resolved'
					? { ...event, payload: { ...event.payload, by: { ...PERSON, id: 'someone-else' } } }
					: event
			)
		};
		await expect(verifyTraceDigest(flipped)).resolves.toBe(false);
		const renamed = {
			...trace,
			events: trace.events.map((event) =>
				event.type === 'run.started'
					? { ...event, payload: { ...event.payload, principal: PERSON } }
					: event
			)
		};
		await expect(verifyTraceDigest(renamed)).resolves.toBe(false);
	});
});
