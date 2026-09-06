import { describe, expect, it } from 'vitest';
import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { buildSpec as adviceSpec } from '@craftabot/pack-fs-advice/testing';
import { buildSpec as starterSpec } from '@craftabot/pack-starter/testing';
import { createRegistry } from '../packs.js';
import { applyStack, complianceWatchbotFor, stackOf } from './stacks.js';

/**
 * Named stacks (WP64, `56-…` §4.4): the Compliance Watchbot written into a
 * desk bot's safety socket from what its desk's pack ships — the cards on
 * the Safety Brick, a judge per conduct evaluator up to the socket's room,
 * the Watchbot — and refused for a bot in a room or a desk with no judge to
 * fit. The readback is the bricks' shape.
 */
const registry = createRegistry();
const v2 = (spec: ReturnType<typeof adviceSpec>): AgentSpecV2 => {
	const migrated = migrateAgentSpec(spec);
	if ('kind' in migrated) throw new Error(migrated.message);
	return migrated;
};

describe('the Compliance Watchbot preset', () => {
	it('fits the desk’s cards, its judges and the Watchbot on an Advice Desk bot, within the socket', () => {
		const spec = v2(adviceSpec());
		const plan = complianceWatchbotFor(spec, registry);
		expect(plan).toMatchObject({ ok: true, packId: 'fs-advice' });
		if (!plan.ok) return;
		expect(plan.policyCards.length).toBeGreaterThan(0);
		expect(plan.evaluatorIds[0]).toMatch(/^fs-advice\//);

		const next = applyStack(spec, 'compliance-watchbot', registry);
		expect(next).toBeDefined();
		const safety = next?.bricks.filter((brick) => brick.slot === 'safety') ?? [];
		expect(safety.map((brick) => brick.kind)).toEqual([
			'starter/safety',
			'workshop/monitor-judge',
			'workshop/monitor-judge',
			'monitor/watchbot'
		]);
		expect((safety[0]?.config as { policyCards: string[] }).policyCards).toEqual(plan.policyCards);
		expect((safety[1]?.config as { evaluatorId: string }).evaluatorId).toBe(plan.evaluatorIds[0]);
		expect((safety[3]?.config as { watchFor: string[] }).watchFor).toContain(
			'monitor/going-in-circles'
		);
		// The rest of the build is untouched; the readback names the stack.
		expect(next?.bricks.filter((brick) => brick.slot !== 'safety')).toEqual(
			spec.bricks.filter((brick) => brick.slot !== 'safety')
		);
		expect(stackOf(next as AgentSpecV2)).toBe('compliance-watchbot');
		expect(stackOf(spec)).toBeUndefined();
	});

	it('fits on a Kit-built desk bot with no Safety Brick at all, from the kind’s defaults', () => {
		const spec = v2(starterSpec({ goalCardId: 'fs-advice/advise-inheritance' }));
		expect(spec.bricks.some((brick) => brick.slot === 'safety')).toBe(false);
		const next = applyStack(spec, 'compliance-watchbot', registry);
		expect(next?.bricks.filter((brick) => brick.slot === 'safety')).toHaveLength(4);
		expect(stackOf(next as AgentSpecV2)).toBe('compliance-watchbot');
	});

	it('keeps a fitted Safety Brick’s own config, cards aside', () => {
		const spec = v2(
			adviceSpec({
				safety: { maxTicks: 7, blockedActions: ['execute-investment'], approvalMode: true }
			})
		);
		const next = applyStack(spec, 'compliance-watchbot', registry);
		const safety = next?.bricks.find((brick) => brick.kind === 'starter/safety');
		expect(safety?.config).toMatchObject({ maxTicks: 7, blockedActions: ['execute-investment'] });
	});

	it('refuses a bot in a room', () => {
		const spec = v2(starterSpec({ goalCardId: 'starter/say-hello' }));
		expect(complianceWatchbotFor(spec, registry)).toMatchObject({
			ok: false,
			reason: expect.stringContaining('room')
		});
		expect(applyStack(spec, 'compliance-watchbot', registry)).toBeUndefined();
	});
});
