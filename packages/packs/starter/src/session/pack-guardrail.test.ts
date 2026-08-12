import {
	createPackRegistry,
	createSession,
	type EngineEvent,
	type GuardrailDefinition,
	type PackManifest
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import starterPack from '../index.js';
import { buildSpec } from './harness.js';

/**
 * **08-GOVERNANCE-GUARDRAILS.md §7.3** — "a guardrail can be added by a pack
 * without touching engine code (prove with a test-only guardrail in the test
 * suite)."
 *
 * `pack-registry.test.ts` already proves a pack's guardrails are *registered*.
 * That is the cheaper half of the claim: registration is not the same as
 * working. This drives a pack-contributed guardrail through a real session over
 * the real Playroom, which is what "without touching engine code" actually has
 * to mean — the interesting failure would be an engine that only honours
 * guardrails it recognises.
 */

/** A world-invariant rule of the kind §5 anticipates in the Agent Builder era. */
const neverTakeTeddysSnack: GuardrailDefinition = {
	id: 'test/never-take-teddys-snack',
	name: "Never Take Teddy's Snack",
	description: 'A pack-authored world-invariant rule.',
	hooks: ['pre-act'],
	create: () => ({
		id: 'test/never-take-teddys-snack',
		name: "Never Take Teddy's Snack",
		description: 'A pack-authored world-invariant rule.',
		hooks: ['pre-act'],
		check: (ctx) => {
			const args = ctx.proposed?.arguments;
			const item =
				args !== null && typeof args === 'object' ? (args as { item?: unknown }).item : undefined;
			return ctx.proposed?.name === 'pick_up' && item === 'biscuit'
				? {
						allow: false,
						reason: 'That biscuit belongs to Teddy.',
						disposition: 'block-action' as const
					}
				: { allow: true };
		}
	})
};

const guardrailPack: PackManifest = {
	id: 'test-governance',
	name: 'Test governance pack',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	guardrails: [neverTakeTeddysSnack],
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted and deterministic.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};

describe('a guardrail contributed by a pack', () => {
	it('is enforced by the engine exactly like a built-in one', async () => {
		const registry = createPackRegistry();
		registry.registerPack(starterPack);
		registry.registerPack(guardrailPack);

		// The engine never learns this rule's name — it comes out of the registry
		// as an ordinary `Guardrail` and goes straight into the chain.
		const definition = registry.getGuardrail('test/never-take-teddys-snack');
		if (!definition) throw new Error('the pack-contributed guardrail was not registered');

		const clock = createTestClock();
		const events: EngineEvent[] = [];
		const session = createSession({
			spec: buildSpec({ goalCardId: 'starter/snack' }),
			registry,
			provider: createMockProvider({
				script: obedient([
					{ say: 'I fancy that biscuit.', call: 'pick_up', args: { item: 'biscuit' } },
					{ say: 'Suit yourself.', call: 'move', args: { direction: 'east' } }
				])
			}),
			guardrails: [definition.create()],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		session.events.onAny((event) => events.push(event));

		session.start('step');
		await session.step();

		const tripped = events.find((event) => event.type === 'guardrail.tripped');
		if (tripped?.type !== 'guardrail.tripped') throw new Error('the pack guardrail never tripped');
		expect(tripped.payload.guardrailId).toBe('test/never-take-teddys-snack');
		expect(tripped.payload.disposition).toBe('block-action');

		// And the standard feedback path applies to it too, unchanged.
		await session.step();
		const prompts = events.filter((event) => event.type === 'prompt.composed');
		const latest = prompts.at(-1);
		if (latest?.type !== 'prompt.composed') throw new Error('expected a later prompt');
		expect(latest.payload.messages.at(-1)?.content).toContain('That biscuit belongs to Teddy.');
	});
});
