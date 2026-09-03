import type { AgentSpecV2, EngineEvent, PackManifest } from '@craftabot/core';
import { makeRun, obedient } from '@craftabot/core/testing';
import trace from './fixtures/trace.geap-armour-offline.v1.json' with { type: 'json' };
import starterPack from '@craftabot/pack-starter';
import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import geapPack from './index.js';

/**
 * The generic pack-conformance kit (`@craftabot/pack-testkit`, `13-…` §7),
 * run against this pack's own content — `25-…` §11 Stage D's own "L2
 * contract test". `pack-geap` ships one brick kind and no world, tools or
 * actions of its own, so `starterPack` is a companion for the same reason
 * every other content-free pack's own contract test needs one: a spec
 * fitting `geap/armor` alongside a real bot still needs a brain, senses and
 * hands to be a legal spec at all.
 */

const CARTRIDGE_PACK: PackManifest = {
	id: 'test',
	name: 'Test cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted, deterministic, never sends anything anywhere.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};

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

const spec: AgentSpecV2 = {
	id: '77777777-7777-4777-8777-777777777777',
	name: 'Armoured Conformance Bot',
	schemaVersion: 2,
	identity: { displayName: 'Armoured Conformance Bot', boxArtSeed: 'seed' },
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

const fixture: PackConformanceFixture = {
	manifest: geapPack,
	companionPacks: [starterPack, CARTRIDGE_PACK],
	goldenTrace: {
		spec,
		script: obedient(SAY_HELLO_PLAN)
	},
	/** WP39 stage E (`29-…` §4.7): the service through the generic conformance check. */
	guardrailServices: {
		'geap/model-armor': {
			config: { projectId: 'proj-1', location: 'europe-west2', templateId: 'cab-armour' },
			requests: (['pre-think', 'pre-act', 'post-act'] as const).map((hook) => ({
				hook,
				text: 'Hello Teddy',
				envelope: { agentId: spec.id, tick: 1 }
			})),
			plantedSecret: 'ya29.planted-secret-token'
		}
	},
	/** WP51 (`39-…` §4.2): the three hosted evaluators through `checkEvaluator` — offline-present, evidence real, no leak. */
	evaluators: Object.fromEntries(
		['safety', 'fulfillment', 'rubric'].map((metric) => [
			`geap/eval/${metric}`,
			{
				inputs: [
					{
						run: makeRun({ id: (trace as unknown as EngineEvent[])[0]?.runId ?? '' }),
						events: trace as unknown as EngineEvent[]
					}
				],
				config: {
					projectId: 'proj-1',
					location: 'europe-west2',
					metricPromptTemplate: 'Rate {transcript} against {goal} from 1 to 5.'
				},
				plantedSecret: 'ya29.planted-secret-token'
			}
		])
	)
};

describeConformance(fixture);
