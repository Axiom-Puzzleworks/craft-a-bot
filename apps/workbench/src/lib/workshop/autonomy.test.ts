import { describe, expect, it } from 'vitest';
import { makeSpec } from '@craftabot/core/testing';
import { AUTONOMY_LEVELS, AUTONOMY_PRESETS, applyAutonomy, autonomyOf } from './autonomy.js';

/** The dial writes real values (WP52, `40-DEBTS.md` §4.1), and the readback reads the spec, not the preset. */
describe('applyAutonomy / autonomyOf', () => {
	it('says when no Safety Brick is fitted, and applies nothing', () => {
		const spec = makeSpec();
		const bare = {
			...spec,
			bricks: spec.bricks.filter((brick) => brick.kind !== 'starter/safety')
		};
		expect(autonomyOf(bare)).toEqual({ fitted: false });
		expect(applyAutonomy(bare, 'observer')).toBeUndefined();
	});

	it('writes the preset into the fitted Safety Brick and records the level, leaving the rest', () => {
		const spec = makeSpec();
		const withSafety = spec.bricks.some((brick) => brick.kind === 'starter/safety')
			? spec
			: {
					...spec,
					bricks: [
						...spec.bricks,
						{
							slot: 'safety' as const,
							kind: 'starter/safety',
							configVersion: 2,
							config: { maxTicks: 30, blockedActions: ['move'], approval: 'off', repeatLimit: 3 }
						}
					]
				};
		for (const level of AUTONOMY_LEVELS) {
			const next = applyAutonomy(withSafety, level);
			expect(next).toBeDefined();
			const read = autonomyOf(next!);
			expect(read).toEqual({
				fitted: true,
				level,
				approval: AUTONOMY_PRESETS[level].approval,
				maxTicks: AUTONOMY_PRESETS[level].maxTicks,
				maxTokens: AUTONOMY_PRESETS[level].maxTokens
			});
			const safety = next!.bricks.find((brick) => brick.kind === 'starter/safety');
			expect((safety?.config as { blockedActions: string[] }).blockedActions).toEqual(['move']);
		}
		// The original is untouched.
		expect(autonomyOf(withSafety).level).toBeUndefined();
	});

	it('has four distinct presets, each a stricter or looser leash than the next', () => {
		expect(AUTONOMY_PRESETS.operator.approval).toBe('everything');
		expect(AUTONOMY_PRESETS.observer.approval).toBe('off');
		expect(AUTONOMY_PRESETS.operator.maxTicks).toBeLessThan(AUTONOMY_PRESETS.collaborator.maxTicks);
		expect(AUTONOMY_PRESETS.collaborator.maxTicks).toBeLessThan(AUTONOMY_PRESETS.approver.maxTicks);
		expect(AUTONOMY_PRESETS.approver.maxTicks).toBeLessThan(AUTONOMY_PRESETS.observer.maxTicks);
	});
});
