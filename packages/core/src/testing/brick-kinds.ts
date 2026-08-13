import {
	actionsBrickSchema,
	llmBrickSchema,
	memoryBrickSchema,
	safetyBrickSchema,
	senseBrickSchema,
	toolsBrickSchema
} from '../schemas/agent-spec.js';
import type { BrickKindDefinition, SlotId } from '../types/brick.js';

/**
 * **The six V1 bricks, as kinds, for tests that need a registry** (WP14).
 *
 * Since the loop builds runtimes from registered kinds, a stub registry with no
 * kinds is a bot with nothing fitted — no tools offered, no actions, no
 * personality. Every core test that stands a registry up needs these, and it
 * was on its way to being written out three times.
 *
 * Naming starter ids inside core looks like a layering violation and is the
 * same one `migrateAgentSpec` makes deliberately: v1 *could only ever* hold
 * these six, because the key names were baked into the schema. This is
 * describing history, not expressing a dependency — and it is test scaffolding,
 * so the real behaviour still has to be proved against the real pack.
 *
 * The runtimes here are the minimum that makes a bot work: what each brick
 * *offers*. The prose each one contributes is the starter pack's, and is
 * deliberately absent.
 */

const V1_KINDS = [
	['starter/llm', 'brain', llmBrickSchema],
	['starter/memory', 'memory', memoryBrickSchema],
	['starter/tools', 'equipment', toolsBrickSchema],
	['starter/sense', 'perception', senseBrickSchema],
	['starter/actions', 'mobility', actionsBrickSchema],
	['starter/safety', 'safety', safetyBrickSchema]
] as const satisfies ReadonlyArray<readonly [string, SlotId, unknown]>;

/** Which of the six contribute callable things, and under which key. */
const OFFERS: Record<string, 'toolIds' | 'actionIds'> = {
	'starter/tools': 'toolIds',
	'starter/actions': 'actionIds'
};

export function v1BrickKinds(): BrickKindDefinition[] {
	return V1_KINDS.map(([id, slot, configSchema]) => {
		const offers = OFFERS[id];
		return {
			id,
			slot,
			name: id,
			description: id,
			realName: id,
			realExplanation: id,
			configSchema,
			configVersion: 1,
			defaults: {},
			...(offers
				? {
						createRuntime: (config: { enabled?: string[] }) => ({
							contributeCalls: () => ({ [offers]: config.enabled ?? [] })
						})
					}
				: {})
		} as BrickKindDefinition;
	});
}
