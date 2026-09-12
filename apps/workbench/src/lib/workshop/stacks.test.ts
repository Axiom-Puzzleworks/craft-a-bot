import { describe, expect, it } from 'vitest';
import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { buildSpec as adviceSpec } from '@craftabot/pack-fs-advice/testing';
import { buildSpec as starterSpec } from '@craftabot/pack-starter/testing';
import { createRegistry } from '../packs.js';
import { applyStack, complianceWatchbotFor, stackOf, stacksFor } from './stacks.js';

/**
 * Named stacks as content (WP64, `56-…` §4.4; WP97, `89-STACKS.md` §5): the
 * desk's pack ships its stacks, the reader lists them for a desk bot and
 * refuses a bot in a room; a stack is written into the Safety Brick as its
 * `stack`, and a stack with a chokepoint half also fits the judges and the
 * Watchbot. The readback is the brick's config, never a remembered pick.
 */
const registry = createRegistry();
const v2 = (spec: ReturnType<typeof adviceSpec>): AgentSpecV2 => {
	const migrated = migrateAgentSpec(spec);
	if ('kind' in migrated) throw new Error(migrated.message);
	return migrated;
};
const WATCHBOT_STACK = 'fs-advice/stack/compliance-watchbot';
const CARDS_STACK = 'fs-advice/stack/policy-cards';

describe('the stacks a desk bot may fit', () => {
	it('lists the desk’s pack’s stacks, and the Compliance Watchbot plan still reads the desk', () => {
		const spec = v2(adviceSpec());
		const plan = stacksFor(spec, registry);
		expect(plan).toMatchObject({ ok: true, packId: 'fs-advice' });
		if (!plan.ok) return;
		expect(plan.stacks.map((stack) => stack.id)).toEqual(
			expect.arrayContaining([CARDS_STACK, WATCHBOT_STACK])
		);
		expect(plan.stacks.every((stack) => stack.id.startsWith('fs-advice/'))).toBe(true);
		const watchbot = complianceWatchbotFor(spec, registry);
		expect(watchbot).toMatchObject({ ok: true, packId: 'fs-advice' });
		if (watchbot.ok) expect(watchbot.evaluatorIds[0]).toMatch(/^fs-advice\//);
	});

	it('the Compliance Watchbot stack fits the Safety Brick with the stack, the judges and the Watchbot, within the socket', () => {
		const spec = v2(adviceSpec());
		const next = applyStack(spec, WATCHBOT_STACK, registry);
		expect(next).toBeDefined();
		const safety = next?.bricks.filter((brick) => brick.slot === 'safety') ?? [];
		expect(safety.map((brick) => brick.kind)).toEqual([
			'starter/safety',
			'workshop/monitor-judge',
			'workshop/monitor-judge',
			'monitor/watchbot'
		]);
		expect((safety[0]?.config as { stack: string }).stack).toBe(WATCHBOT_STACK);
		expect((safety[3]?.config as { watchFor: string[] }).watchFor).toContain(
			'monitor/going-in-circles'
		);
		expect(next?.bricks.filter((brick) => brick.slot !== 'safety')).toEqual(
			spec.bricks.filter((brick) => brick.slot !== 'safety')
		);
		expect(stackOf(next as AgentSpecV2)).toBe(WATCHBOT_STACK);
		expect(stackOf(spec)).toBeUndefined();
	});

	it('a stack with no chokepoint half is the Safety Brick alone', () => {
		const spec = v2(adviceSpec());
		const next = applyStack(spec, CARDS_STACK, registry);
		expect(next?.bricks.filter((brick) => brick.slot === 'safety').map((b) => b.kind)).toEqual([
			'starter/safety'
		]);
		expect(stackOf(next as AgentSpecV2)).toBe(CARDS_STACK);
	});

	it('fits on a Kit-built desk bot with no Safety Brick at all, from the kind’s defaults', () => {
		const spec = v2(starterSpec({ goalCardId: 'fs-advice/advise-inheritance' }));
		expect(spec.bricks.some((brick) => brick.slot === 'safety')).toBe(false);
		const next = applyStack(spec, WATCHBOT_STACK, registry);
		expect(next?.bricks.filter((brick) => brick.slot === 'safety')).toHaveLength(4);
		expect(stackOf(next as AgentSpecV2)).toBe(WATCHBOT_STACK);
	});

	it('keeps a fitted Safety Brick’s own config beside the stack', () => {
		const spec = v2(
			adviceSpec({
				safety: { maxTicks: 7, blockedActions: ['execute-investment'], approvalMode: true }
			})
		);
		const next = applyStack(spec, CARDS_STACK, registry);
		const safety = next?.bricks.find((brick) => brick.kind === 'starter/safety');
		expect(safety?.config).toMatchObject({
			maxTicks: 7,
			blockedActions: ['execute-investment'],
			stack: CARDS_STACK
		});
	});

	it('refuses a bot in a room, and a stack the desk does not ship', () => {
		const spec = v2(starterSpec());
		expect(stacksFor(spec, registry)).toMatchObject({ ok: false });
		expect(applyStack(spec, WATCHBOT_STACK, registry)).toBeUndefined();
		expect(applyStack(v2(adviceSpec()), 'fs-lending/stack/policy-cards', registry)).toBeUndefined();
	});
});
