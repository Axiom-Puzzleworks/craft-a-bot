import { createRegistry } from './config.js';
import { defaultPacks } from './config.js';
import { contextCheck } from '@craftabot/governance';
import { describe, expect, it } from 'vitest';

/**
 * **The rule on the case file, as a property** (plan 114 WP206, G183): the audit of `113-…` §12 — which found the desk brief was never in
 * the prompt — made a test. Every desk's every layout, observed through all of its senses as the bot reads it, carries a statement of the
 * rule the case is scored against. `governance/context-assembly` is the same check made at run time (`contextCheck`); this is the check
 * made over the content, once, for all of it.
 *
 * What counts as the rule: the lending, disputes, collections, onboarding and servicing desks join a `rule:` line (the `policy` record) to a
 * sense; the advice desk's suitability rule and the complaints desk's register rule are shown by their own case-file senses; fraud's rule is
 * the alert's own signals. Each is named below with the words that carry it, so a desk that loses its rule fails by name.
 */
const RULE_WORDS: Record<string, RegExp> = {
	'fs-lending/the-lending-desk': /rule:/i,
	'fs-disputes/the-disputes-desk': /rule:/i,
	'fs-collections/the-collections-desk': /rule:/i,
	'fs-onboarding/the-onboarding-desk': /rule:/i
};

describe('the rule is on the case file', () => {
	const registry = createRegistry({ packs: defaultPacks() });

	for (const [worldId, words] of Object.entries(RULE_WORDS)) {
		it(`${worldId}: every layout's observation states the rule, and contextCheck sees it`, () => {
			const world = registry.getWorld(worldId);
			expect(world, worldId).toBeDefined();
			const senses = world!.senses.map((sense) => sense.id);
			let seen = 0;
			for (const layout of world!.layouts) {
				const instance = world!.create(layout.id, { random: () => 0.5 });
				const text = instance.observe(senses).text;
				expect(text, `${worldId} ${layout.id}`).toMatch(words);
				const checked = contextCheck([{ role: 'user', content: text }], [words.source]);
				expect(checked.missing).toEqual([]);
				seen += 1;
			}
			expect(seen).toBeGreaterThan(3);
		});
	}

	it('contextCheck names what a prompt lacks, and its digest moves with the prompt', () => {
		const withRule = contextCheck(
			[
				{ role: 'system', content: 'the framework' },
				{ role: 'user', content: 'case file\nrule: refer within 3 points' }
			],
			['rule:', 'worksheet']
		);
		expect(withRule.missing).toEqual(['worksheet']);
		const other = contextCheck([{ role: 'user', content: 'case file' }], ['rule:']);
		expect(other.missing).toEqual(['rule:']);
		expect(other.digest).not.toBe(withRule.digest);
		// The framework's own system message is not part of what the desk put in front of the bot.
		expect(contextCheck([{ role: 'system', content: 'rule: x' }], ['rule:']).missing).toEqual([
			'rule:'
		]);
	});
});
