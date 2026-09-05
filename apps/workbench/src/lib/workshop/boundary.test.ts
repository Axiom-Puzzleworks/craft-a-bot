import {
	createPackRegistry,
	hostMatches,
	type AgentSpecV2,
	type EngineEvent,
	type PackManifest
} from '@craftabot/core';
import { boundaryMapFor } from '@craftabot/governance/reports';
import geapPack from '@craftabot/pack-geap';
import starterPack from '@craftabot/pack-starter';
import workshopPack from '@craftabot/pack-workshop';
import { describe, expect, it } from 'vitest';
import armourTrace from '../../../../../packages/packs/geap/src/fixtures/trace.geap-armour-offline.v1.json';
import deskTrace from '../../../../../packages/desk/src/fixtures/trace.desk-minimal.v1.json';
import sayHelloTrace from '../../../../../packages/packs/starter/src/fixtures/trace.say-hello.v1.json';

/**
 * The Boundary fold over the three golden traces (WP57 stage C, `44-…`
 * §4.5) — snapshot-tested here, where the packs and the fold can both be
 * reached (`governance` may not import a pack), with the property that
 * every outside host is inside `run.started.egress.hosts` when a mode was
 * named. The specs are the ones the goldens were recorded with.
 */
const CARTRIDGES: PackManifest = {
	id: 'test',
	name: 'Test cartridges',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};

function registry() {
	const r = createPackRegistry();
	r.registerPack(starterPack);
	r.registerPack(workshopPack);
	r.registerPack(geapPack);
	r.registerPack(CARTRIDGES);
	return r;
}

const brick = (slot: string, kind: string, config: Record<string, unknown>) => ({
	slot,
	kind,
	configVersion: 1,
	config
});

const sayHelloSpec = {
	id: '22222222-2222-4222-8222-222222222222',
	name: 'Testbot',
	schemaVersion: 2,
	identity: { displayName: 'Testbot', boxArtSeed: 'seed' },
	goalCardId: 'starter/say-hello',
	bricks: [
		brick('brain', 'starter/llm', {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: ''
		}),
		brick('perception', 'starter/sense', {
			channels: ['starter/playroom/sight', 'starter/playroom/compass']
		}),
		brick('mobility', 'starter/actions', {
			enabled: ['starter/playroom/move', 'starter/playroom/say']
		}),
		brick('memory', 'starter/memory', { windowSize: 10, notebook: true })
	],
	createdAt: '2026-08-16T09:00:00Z',
	updatedAt: '2026-08-16T09:00:00Z'
} as unknown as AgentSpecV2;

const armouredSpec = {
	...sayHelloSpec,
	id: '66666666-6666-4666-8666-666666666666',
	name: 'Armoured Tinybot',
	identity: { displayName: 'Armoured Tinybot', boxArtSeed: 'seed' },
	bricks: [
		...sayHelloSpec.bricks.filter((b) => b.slot !== 'memory'),
		brick('memory', 'starter/memory', { windowSize: 10, notebook: false }),
		brick('safety', 'geap/armor', {
			projectId: 'proj-1',
			location: 'europe-west2',
			templateId: 'cab-armour',
			offline: true,
			screenDecision: 'note'
		})
	]
} as unknown as AgentSpecV2;

const deskSpec = {
	...sayHelloSpec,
	id: '33333333-3333-4333-8333-333333333333',
	name: 'Deskbot',
	identity: { displayName: 'Deskbot', boxArtSeed: 'seed' },
	goalCardId: 'workshop/sign-the-visitor-in',
	bricks: [
		brick('brain', 'starter/llm', {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 64,
			personality: ''
		}),
		brick('perception', 'starter/sense', { channels: ['conversation', 'case-file', 'queue'] }),
		brick('mobility', 'starter/actions', { enabled: ['say', 'look-up', 'sign-in'] }),
		brick('memory', 'starter/memory', { windowSize: 10, notebook: false })
	]
} as unknown as AgentSpecV2;

const goldens: Array<[string, AgentSpecV2, EngineEvent[]]> = [
	['say-hello', sayHelloSpec, sayHelloTrace as EngineEvent[]],
	['geap-armour-offline', armouredSpec, armourTrace as EngineEvent[]],
	['desk-minimal', deskSpec, deskTrace as EngineEvent[]]
];

describe('boundaryMapFor over the golden traces', () => {
	it.each(goldens)('%s folds to the committed snapshot', (_name, spec, events) => {
		const map = boundaryMapFor(spec, registry(), { events });
		expect(map).toMatchSnapshot();
	});

	it.each(goldens)(
		'%s: every outside host is inside the run’s declared egress when a mode was named',
		(_name, spec, events) => {
			const map = boundaryMapFor(spec, registry(), { events });
			if (map.boundary.egress.mode === undefined) return;
			for (const entry of map.outside) {
				for (const host of entry.hosts) {
					expect(
						map.boundary.egress.hosts.some((pattern) => hostMatches(pattern, host)),
						`${entry.kind} ${entry.id} reaches ${host}`
					).toBe(true);
				}
			}
			expect((map.activity ?? []).filter((a) => a.verdict === 'outside-egress')).toEqual([]);
		}
	);

	it('the armour golden lights the Model Armor edge on the ticks of its guardrail.external', () => {
		const map = boundaryMapFor(armouredSpec, registry(), { events: armourTrace as EngineEvent[] });
		const armour = map.outside.find((entry) => entry.kind === 'guard-service');
		expect(armour?.id).toBe('geap/model-armor');
		const hits = (map.activity ?? []).filter((a) => a.edge === 'guard-service:geap/model-armor');
		expect(hits.map((a) => a.tick)).toEqual([1, 2, 3, 4]);
		expect(hits.every((a) => a.outcome === 'offline')).toBe(true);
	});

	it('the desk golden puts a desk inside the ring', () => {
		const map = boundaryMapFor(deskSpec, registry(), { events: deskTrace as EngineEvent[] });
		expect(map.inside.world).toEqual({
			id: 'workshop/the-desk',
			name: 'The Front Desk',
			view: 'desk'
		});
	});
});
