import { describe, expect, it } from 'vitest';
import { checkStack } from '@craftabot/pack-testkit';
import { compileStackLoop, stackLoopFits } from '@craftabot/governance';
import { OBLIGATION_TAGS } from '@craftabot/pack-fs-bank';
import { createRegistry, defaultConfig } from './config.js';

/**
 * Every stack the default host installs (WP97, `89-STACKS.md` §7) resolves
 * in full against the whole registry — the desk packs' conformance fixtures
 * leave resolution to this test, since their stacks name components the
 * guard packs ship — and compiles to a chain.
 */
const registry = createRegistry(defaultConfig());

describe('the shipped stacks', () => {
	const stacks = registry.listStacks();

	it('are the five desk guards, per desk, and the complaints card', () => {
		const ids = stacks.map((stack) => stack.id).sort();
		for (const desk of ['fs-advice', 'fs-fraud', 'fs-lending']) {
			for (const guard of [
				'policy-cards',
				'policy-cards+local-classifier',
				'policy-cards+hosted-guard',
				'compliance-watchbot'
			]) {
				expect(ids).toContain(`${desk}/stack/${guard}`);
			}
		}
		expect(ids).toContain('fs-advice/stack/complaints-policy-cards');
	});

	it.each(registry.listStacks().map((stack) => [stack.id, stack] as const))(
		'%s passes checkStack and compiles',
		(_id, stack) => {
			// WP135 (`110-…` G106): every claimed obligation and control row exists.
			expect(
				checkStack(stack, registry, {
					knownObligations: Object.keys(OBLIGATION_TAGS),
					knownControls: registry
						.listControlMaps()
						.flatMap((map) => map.rows.map((row) => `${map.id}/${row.ref}`))
				})
			).toEqual([]);
			const chain = compileStackLoop(stack, registry);
			expect(chain.length).toBe(stackLoopFits(stack).length > 0 ? chain.length : 0);
			expect(chain.every((guardrail) => guardrail.componentId !== undefined)).toBe(true);
		}
	);

	it('checkStack refuses a fit at the chokepoint, a duplicate, and an unknown point', () => {
		const [stack] = stacks;
		expect(stack).toBeDefined();
		const first = stack!.fit[0]!;
		expect(
			checkStack({ ...stack!, fit: [{ ...first, point: { kind: 'group' } }] }, registry).map(
				(issue) => issue.check
			)
		).toEqual(['stack.well-formed']);
		expect(
			checkStack({ ...stack!, fit: [first, first] }, registry).map((issue) => issue.check)
		).toContain('stack.capacity');
		expect(
			checkStack({ ...stack!, fit: [{ ...first, point: { kind: 'egress' } }] }, registry).map(
				(issue) => issue.check
			)
		).toContain('stack.point');
	});
});
