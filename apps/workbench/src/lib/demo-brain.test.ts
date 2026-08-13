import type { AgentSpec } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { capabilitiesOf, type BotCapabilities } from './bot-capabilities.js';
import { createRegistry } from './packs.js';
import { createDemoBrain, demoVariantFor, hasDemoPlan } from './demo-brain.js';

/**
 * The six teaching moments in `02-AGENT-MODEL.md` §9 are failure→fix pairs, so
 * what has to be true is that the *failure happens*. Before WP9 the demo brain
 * never saw the spec and every one of these ran the success script regardless —
 * the lesson was inert and nothing in the suite noticed.
 *
 * These tests pin the *choice* of run. That the chosen script then produces the
 * right ending is proven end-to-end in `e2e/leaflet.spec.ts`, against the real
 * world.
 *
 * > **Amended 2026-08-13 (WP14 slice 4c):** the demo brain is handed
 * > **capabilities** rather than a spec. The fixtures are still written as v1
 * > specs, deliberately — a bot on somebody's shelf is one, and running them
 * > through `capabilitiesOf` exercises the whole chain (migration, registered
 * > kinds, contributions) rather than a hand-built capability object that could
 * > claim anything.
 */

function spec(bricks: Partial<AgentSpec['bricks']> = {}): AgentSpec {
	return {
		id: '33333333-3333-4333-8333-333333333333',
		name: 'Tutorialbot',
		bricks: {
			llm: { cartridgeId: 'demo/brain', temperature: 0, maxTokens: 256, personality: '' },
			...bricks
		},
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1
	};
}

/** What the bot can do, through the real registry and the real bricks. */
function can(built: AgentSpec): BotCapabilities {
	return capabilitiesOf(built, createRegistry());
}

const ACTIONS = { enabled: ['move', 'say', 'pick_up', 'give', 'open', 'celebrate'] };
const SIGHT = { channels: ['sight', 'compass'] };
const MEMORY = { windowSize: 10 as const, notebook: false };

describe('chapter 1 — a brain with no hands', () => {
	it('picks the no-actions run when nothing can act', () => {
		expect(demoVariantFor('starter/say-hello', can(spec()))).toBe('no-actions');
	});

	it('stops picking it once the Actions brick is fitted', () => {
		expect(demoVariantFor('starter/say-hello', can(spec({ actions: ACTIONS })))).not.toBe(
			'no-actions'
		);
	});
});

describe('chapter 2 — hands but no eyes', () => {
	it('picks the blind run when the bot can act but not see', () => {
		expect(demoVariantFor('starter/say-hello', can(spec({ actions: ACTIONS })))).toBe('no-sight');
	});

	it('runs the successful script once Sense is fitted', () => {
		const built = spec({ actions: ACTIONS, sense: SIGHT });
		expect(demoVariantFor('starter/say-hello', can(built))).toBeUndefined();
	});
});

describe('chapter 3 — no memory', () => {
	const snack = (bricks: Partial<AgentSpec['bricks']>) => ({
		...spec(bricks),
		goalCardId: 'starter/snack'
	});

	it('picks the forgetful run when Memory is missing', () => {
		expect(demoVariantFor('starter/snack', can(snack({ actions: ACTIONS, sense: SIGHT })))).toBe(
			'no-memory'
		);
	});

	it('succeeds once Memory is fitted', () => {
		expect(
			demoVariantFor(
				'starter/snack',
				can(snack({ actions: ACTIONS, sense: SIGHT, memory: MEMORY }))
			)
		).toBeUndefined();
	});
});

describe('chapter 4 — hallucination', () => {
	const sums = (tools?: string[]) => ({
		...spec({
			actions: ACTIONS,
			sense: SIGHT,
			memory: MEMORY,
			...(tools ? { tools: { enabled: tools } } : {})
		}),
		goalCardId: 'starter/sums-for-teddy'
	});

	it('guesses when there is no calculator', () => {
		expect(demoVariantFor('starter/sums-for-teddy', can(sums()))).toBe('no-calculator');
	});

	it('still guesses when the tool belt exists but the calculator is not on it', () => {
		// The gap is the *tool*, not the brick — fitting an empty belt fixes nothing.
		expect(demoVariantFor('starter/sums-for-teddy', can(sums(['starter/dice'])))).toBe(
			'no-calculator'
		);
	});

	it('works it out once the calculator is enabled', () => {
		expect(
			demoVariantFor('starter/sums-for-teddy', can(sums(['starter/calculator'])))
		).toBeUndefined();
	});
});

describe('chapter 5 — retrieval', () => {
	const chest = (tools: string[]) => ({
		...spec({
			actions: ACTIONS,
			sense: SIGHT,
			memory: MEMORY,
			tools: { enabled: tools }
		}),
		goalCardId: 'starter/locked-chest'
	});

	it('keeps shoving the lid when it cannot look anything up', () => {
		expect(demoVariantFor('starter/locked-chest', can(chest(['starter/calculator'])))).toBe(
			'no-manual'
		);
	});

	it('finds the key once the manual is on the belt', () => {
		expect(
			demoVariantFor(
				'starter/locked-chest',
				can(chest(['starter/calculator', 'starter/look_up_manual']))
			)
		).toBeUndefined();
	});
});

describe('the brain itself', () => {
	it('is keyless and named as such, whichever run it picks', () => {
		const brain = createDemoBrain('starter/say-hello', can(spec()));
		expect(brain.id).toBe('demo');
		expect(brain.keyRequirement).not.toBe('required');
	});

	it('still answers for a card with no script at all', () => {
		expect(hasDemoPlan('starter/tidy-the-blocks')).toBe(false);
		expect(demoVariantFor('starter/tidy-the-blocks', can(spec()))).toBeUndefined();
		// The wanderer is itself honest: a bot that looks busy and achieves nothing.
		expect(createDemoBrain('starter/tidy-the-blocks', can(spec()))).toBeDefined();
	});

	it('falls back to the success script when handed no spec at all', () => {
		expect(createDemoBrain('starter/say-hello')).toBeDefined();
	});
});
