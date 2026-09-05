import type { PackManifest } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import starterPack from '@craftabot/pack-starter';
import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import { FRONT_DESK_WORLD_ID } from './world/desk.js';
import { workshopGoalCards } from './goal-cards.js';
import workshopPack from './index.js';
import { buildSpec } from './session/harness.js';
import { SCRIPTED_OPTIMAL } from './session/plans.js';
import { workshopActionDefinitions } from './world/actions.js';
import { WORKSHOP_WORLD_ID } from './world/workshop.js';

/**
 * **The WP21 definition of done, the Workshop's half** (mirrors
 * `pack-starter/contract.test.ts`): the generic pack-conformance kit
 * (`@craftabot/pack-testkit`, `13-…` §7) run against this pack's own content.
 *
 * `starterPack` is a companion here for the same reason `session/harness.ts`
 * registers it: this pack ships no bricks of its own, and a v1 spec's
 * `actions`/`sense` keys resolve only to the `starter/*` brick kinds.
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

/** Bare action ids the Workshop actually answers to — not hand-copied. */
const WORLD_ACTION_IDS = new Set(workshopActionDefinitions.map((action) => action.id));
const ROOM_CARDS = workshopGoalCards.filter((card) => card.worldId !== FRONT_DESK_WORLD_ID);

const worldScripts: PackConformanceFixture['world'] = {
	worldId: WORKSHOP_WORLD_ID,
	scripts: Object.fromEntries(
		ROOM_CARDS.map((card) => [
			card.id,
			{
				layoutId: card.layoutId,
				calls: (SCRIPTED_OPTIMAL[card.id] ?? [])
					.filter((step) => WORLD_ACTION_IDS.has(step.call))
					.map((step) => ({ name: step.call, arguments: step.args ?? {} }))
			}
		])
	),
	illegalActions: [
		// Straight into the wall from the bot's starting square (0,4).
		{ layoutId: 'the-workshop', call: { name: 'move', arguments: { direction: 'south' } } },
		// Nothing in the room answers to this name.
		{
			layoutId: 'the-workshop',
			call: { name: 'paint', arguments: { item: 'a shed nobody built', color: 'red' } }
		},
		// Not a Workshop action at all.
		{ layoutId: 'the-workshop', call: { name: 'teleport', arguments: {} } },
		// Fails the action's own Zod schema.
		{ layoutId: 'the-workshop', call: { name: 'move', arguments: { direction: 'sideways' } } }
	],
	// The Workshop's clock advances on every `perform()`, legal or not
	// (`world/workshop.ts`), the same deliberate design as the Playroom's.
	volatileStateKeys: ['tick']
};

const fixture: PackConformanceFixture = {
	manifest: workshopPack,
	companionPacks: [starterPack, CARTRIDGE_PACK],
	world: worldScripts,
	goldenTrace: {
		spec: buildSpec({ goalCardId: 'workshop/find-the-paint-pot' }),
		script: obedient(SCRIPTED_OPTIMAL['workshop/find-the-paint-pot'] ?? [])
	},
	// The Front Desk (WP53, `43-…` §4.8): a conforming world, then a conforming desk.
	desks: {
		[FRONT_DESK_WORLD_ID]: {
			acceptedInjections: ['heard'],
			scripts: {
				'workshop/sign-the-visitor-in': {
					layoutId: 'a-visitor',
					calls: (SCRIPTED_OPTIMAL['workshop/sign-the-visitor-in'] ?? []).map((step) => ({
						name: step.call,
						arguments: step.args ?? {}
					}))
				},
				'hand-them-over': {
					layoutId: 'a-visitor',
					calls: [
						{ name: 'say', arguments: { text: 'One moment.' } },
						{ name: 'escalate', arguments: { reason: 'No appointment on the list.' } }
					]
				}
			},
			illegalActions: [
				{ layoutId: 'a-visitor', call: { name: 'teleport', arguments: {} } },
				{ layoutId: 'a-visitor', call: { name: 'say', arguments: { text: '' } } },
				{ layoutId: 'a-visitor', call: { name: 'look-up', arguments: { record: 'the boiler' } } }
			]
		}
	}
};

describeConformance(fixture);
