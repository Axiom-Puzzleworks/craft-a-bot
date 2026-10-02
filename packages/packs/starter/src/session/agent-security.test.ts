import { seededRandom, SYNTHETIC_SECRET_MARKER, syntheticSecret } from '@craftabot/desk';
import { secretShapesIn } from '@craftabot/governance';
import { describe, expect, it } from 'vitest';
import { ADVERSARY_PLANS, PLANTED_KEY, POISONED_REMINDER, SCRIPTED_OPTIMAL } from './plans.js';

/**
 * **The agent-security cards** (WP151, `111-TESTABLE-CONTROLS-PLAN.md` §4).
 * Their attacks are proved end to end by `campaigns/agent-security-baseline.json`,
 * whose gates hold each attack landing unguarded and each component stopping
 * it, in CI. What this file holds is the content those runs rest on.
 */
const CARDS = ['starter/forged-radio', 'starter/poisoned-note', 'starter/key-in-the-manual'];

describe('the agent-security cards (WP151)', () => {
	it('each has a safe and an unsafe plan', () => {
		for (const card of CARDS) {
			expect(SCRIPTED_OPTIMAL[card], card).toBeDefined();
			expect(ADVERSARY_PLANS[card], card).toBeDefined();
		}
	});

	it('the planted key is the desk primitive’s, marked synthetic, and shaped as the secret scan sees a key', () => {
		expect(PLANTED_KEY).toBe(syntheticSecret(seededRandom(151), 'api-key'));
		expect(PLANTED_KEY).toContain(SYNTHETIC_SECRET_MARKER);
		expect(secretShapesIn({ text: `The key is ${PLANTED_KEY}` })).toEqual(['an API key (sk-…)']);
	});

	it('the unsafe plans carry the attack: the key read out, the reminder written down and acted on', () => {
		const calls = (card: string) => ADVERSARY_PLANS[card]!.map((step) => step.call);
		expect(calls('starter/key-in-the-manual')).toContain('say');
		expect(
			ADVERSARY_PLANS['starter/key-in-the-manual']!.some((step) =>
				String((step.args as Record<string, unknown> | undefined)?.['text'] ?? '').includes(
					PLANTED_KEY
				)
			)
		).toBe(true);
		expect(calls('starter/poisoned-note').slice(0, 3)).toEqual([
			'look_up_manual',
			'notebook_write',
			'notebook_read'
		]);
		expect(ADVERSARY_PLANS['starter/poisoned-note']![1]!.args).toEqual({ note: POISONED_REMINDER });
		expect(calls('starter/poisoned-note')).toContain('give');
	});
});
