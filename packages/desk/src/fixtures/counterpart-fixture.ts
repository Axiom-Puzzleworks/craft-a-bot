import { createPackRegistry, type AgentSpec, type PackRegistry } from '@craftabot/core';
import { v1BrickKinds } from '@craftabot/core/testing';
import {
	COUNTERPART_TEST_DESK_ID,
	counterpartTestDesk,
	counterpartTestDeskSpec
} from '../test-desk.js';

/**
 * The two-seat fixture (WP55, `46-…` §4.4–§4.5): a registry over the talking
 * test desk, the clerk's and the visitor's specs, the clerk's plan. Shared
 * by the seat tests and the two-seat golden; under `fixtures/`, so it is not
 * built.
 */
export const AGENT_ID = '44444444-4444-4444-8444-444444444444';
export const VISITOR_ID = '55555555-5555-4555-8555-555555555555';

export function registryWithCounterpartDesk(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'test',
		name: 'Test desk pack',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [counterpartTestDesk],
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
		],
		goalCards: [
			{
				id: 'test/sign-in-talking',
				title: 'Sign the visitor in',
				goalText: 'Find out who has come and sign them in.',
				worldId: COUNTERPART_TEST_DESK_ID,
				layoutId: 'one-visitor',
				successCondition: 'signed-in',
				hints: [],
				teachesConcepts: [],
				par: 3
			}
		]
	});
	return registry;
}

const spec = (
	id: string,
	name: string,
	channels: string[],
	enabled: string[],
	personality = ''
): AgentSpec => ({
	id,
	name,
	bricks: {
		llm: { cartridgeId: 'test/brain', temperature: 0, maxTokens: 64, personality },
		sense: { channels },
		actions: { enabled },
		memory: { windowSize: 10, notebook: false }
	},
	goalCardId: 'test/sign-in-talking',
	createdAt: '2026-09-05T09:00:00Z',
	updatedAt: '2026-09-05T09:00:00Z',
	schemaVersion: 1
});

export const AGENT_SPEC = spec(
	AGENT_ID,
	'Deskbot',
	['conversation', 'case-file', 'queue'],
	['say', 'look-up', 'sign-in']
);
export const VISITOR_SPEC = spec(
	VISITOR_ID,
	'A. Person',
	['conversation', 'brief'],
	['say', 'hang-up'],
	counterpartTestDeskSpec.counterpart?.persona ?? ''
);

export const AGENT_PLAN = [
	{ say: 'Someone is here.', call: 'say', args: { text: 'Hello, what is your name?' } },
	{ say: 'Opening the record.', call: 'look-up', args: { record: 'visitor' } },
	{ say: 'Signing them in.', call: 'sign-in', args: { visitor: 'A. Person' } }
];
