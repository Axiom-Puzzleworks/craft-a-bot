import type { GuardrailContext, GuardrailHook, PackManifest } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import {
	createActionBlocklistGuardrail,
	createApprovalModeGuardrail,
	createNoRepetitionGuardrail,
	createStepBudgetGuardrail
} from '@craftabot/governance';
import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import { starterGoalCards } from './goal-cards.js';
import starterPack from './index.js';
import { buildSpec } from './session/harness.js';
import { SCRIPTED_OPTIMAL } from './session/plans.js';
import { playroomActionDefinitions } from './world/actions.js';
import { PLAYROOM_WORLD_ID } from './world/playroom.js';

/**
 * **The WP21 definition of done, starter's half**: the pack-conformance kit
 * (`@craftabot/pack-testkit`, `13-…` §7) passes against the same content the
 * rest of the suite already exercises piecemeal. Nothing here is a new proof
 * — the scripted-optimal plans, the tool set, and the safety brick's
 * guardrails are all proven elsewhere in this package — it is the *generic*
 * proof, the one a brand-new expansion pack gets for free by shipping the
 * same shapes.
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

/** Bare action ids the Playroom actually answers to — not hand-copied (`13-…` §7's own drift lesson). */
const WORLD_ACTION_IDS = new Set(playroomActionDefinitions.map((action) => action.id));

/**
 * Every goal card's scripted-optimal plan, cut down to the steps that are
 * world actions. Sums's plan also calls the calculator tool; the world does
 * not need to see that step to reach `correct-sum-said` — the `say` step that
 * follows it is what the predicate actually checks.
 */
const worldScripts: PackConformanceFixture['world'] = {
	worldId: PLAYROOM_WORLD_ID,
	scripts: Object.fromEntries(
		starterGoalCards.map((card) => [
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
		// Straight into the wall from the bot's starting square.
		{ layoutId: 'greeting', call: { name: 'move', arguments: { direction: 'west' } } },
		// Nothing in an empty room answers to this name.
		{
			layoutId: 'greeting',
			call: { name: 'pick_up', arguments: { item: 'a widget nobody put here' } }
		},
		// Not a Playroom action at all.
		{ layoutId: 'greeting', call: { name: 'teleport', arguments: {} } },
		// Fails the action's own Zod schema.
		{ layoutId: 'greeting', call: { name: 'move', arguments: { direction: 'sideways' } } }
	],
	// The Playroom is turn-based: `state.tick` advances on every `perform()`,
	// legal or not (`world/playroom.ts`) — a wasted turn is still a turn, and
	// that is deliberate, not a mutation the "illegal actions never mutate"
	// check should catch. See the dated amendment in `13-…` §7.
	volatileStateKeys: ['tick']
};

function guardrailContext(
	hook: GuardrailHook,
	overrides: Partial<GuardrailContext> = {}
): GuardrailContext {
	return {
		hook,
		tick: 1,
		spec: buildSpec(),
		usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
		worldState: {},
		history: [],
		...overrides
	};
}

const fixture: PackConformanceFixture = {
	manifest: starterPack,
	companionPacks: [CARTRIDGE_PACK],
	world: worldScripts,
	tools: {
		examples: {
			'starter/calculator': { expression: '17 * 23' },
			'starter/dice': { sides: 6, rolls: 2 },
			'starter/notebook_write': { note: 'a note worth remembering' },
			'starter/notebook_read': {},
			'starter/look_up_manual': { query: 'chest' },
			'starter/make_plan': { steps: ['Find the key', 'Open the chest'] },
			'starter/check_off_step': { index: 1 },
			'starter/library_games': { query: 'hide and seek' },
			'starter/library_history': { query: 'the toy chest' },
			'starter/connector_weather_forecast': {},
			'starter/connector_weather_alert': {}
		}
	},
	guardrails: {
		guardrails: [
			{ guardrail: createStepBudgetGuardrail(30), context: guardrailContext('pre-think') },
			{
				guardrail: createActionBlocklistGuardrail(['move']),
				context: guardrailContext('pre-act', {
					proposed: { kind: 'action', name: 'move', arguments: {} }
				})
			},
			{ guardrail: createNoRepetitionGuardrail(3), context: guardrailContext('post-act') },
			{ guardrail: createApprovalModeGuardrail('everything'), context: guardrailContext('pre-act') }
		]
	},
	goldenTrace: {
		spec: buildSpec({ goalCardId: 'starter/say-hello' }),
		script: obedient(SCRIPTED_OPTIMAL['starter/say-hello'] ?? [])
	}
};

describeConformance(fixture);
