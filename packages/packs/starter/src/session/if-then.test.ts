import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **The If/Then brick's own rule matching, over a real session.**
 *
 * The mechanism itself — `contributeReflex` skipping COMPOSE/THINK/DECIDE,
 * staying subject to both guardrail hooks — is proven against fixture bricks
 * in `@craftabot/core`'s own `agent-session.test.ts` (the sizing pass's own
 * stage A). This file is for what only real content can prove: that a real
 * rule, matched against a real Playroom observation, fires at the right
 * moment and not before — the same split `planner.test.ts` already holds to.
 *
 * `starter/tidy-the-blocks` is used throughout because nothing is visible
 * from the bot's own starting square (`greeting`'s own layout has no items
 * at all) — a rule needs something to actually see before "IF you see X" is
 * a real test rather than a vacuous one.
 */

type Rule = {
	ifSees: string;
	then: { kind: 'tool' | 'action'; name: string; arguments?: Record<string, unknown> };
};

function ifThenSpec(rules: Rule[]): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec({ goalCardId: 'starter/tidy-the-blocks' }));
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'reflexes',
		kind: 'starter/if-then',
		config: { rules },
		configVersion: 1
	});
	return migrated;
}

/** Two moves (scripted, brain-driven) put a yellow block one square east. */
const APPROACH = [
	{ say: 'North first.', call: 'move', args: { direction: 'north' } },
	{ say: 'Now east.', call: 'move', args: { direction: 'east' } }
];

describe('the If/Then brick, over a real session', () => {
	it('reacts the instant a rule matches — no brain call that tick', async () => {
		const run = await runToCompletion({
			// Deliberately only two scripted turns: if the reflex on tick 3 did
			// not fire, the mock provider would fall through to its own
			// exhausted-script shrug instead of the rule's own proposal, and
			// the assertions below on the decision's source and call would
			// catch it either way.
			script: obedient(APPROACH),
			spec: ifThenSpec([
				{
					ifSees: 'yellow',
					then: { kind: 'action', name: 'pick_up', arguments: { item: 'yellow block' } }
				}
			]),
			maxTicks: 3
		});

		expect(run.byType('think.started')).toHaveLength(2);
		expect(run.byType('prompt.composed')).toHaveLength(2);

		const decisions = run.byType('decision');
		expect(decisions).toHaveLength(3);
		expect(decisions[2]).toMatchObject({
			type: 'decision',
			payload: {
				source: 'reflex',
				call: { kind: 'action', name: 'pick_up', arguments: { item: 'yellow block' } }
			}
		});

		const picks = run.byType('action.performed');
		expect(picks.at(-1)).toMatchObject({
			type: 'action.performed',
			payload: { name: 'pick_up', result: { ok: true } }
		});
	});

	it('does nothing when no rule matches — the tick thinks exactly as it would unfitted', async () => {
		const run = await runToCompletion({
			script: obedient([
				...APPROACH,
				{ say: 'Carry on.', call: 'move', args: { direction: 'east' } }
			]),
			spec: ifThenSpec([
				{ ifSees: 'a word nothing ever says', then: { kind: 'action', name: 'ping' } }
			]),
			maxTicks: 3
		});

		expect(run.byType('think.started')).toHaveLength(3);
		for (const decision of run.byType('decision')) {
			expect(decision).toMatchObject({ type: 'decision', payload: { source: 'brain' } });
		}
	});

	it('the first matching rule wins, in list order', async () => {
		const run = await runToCompletion({
			script: obedient(APPROACH),
			spec: ifThenSpec([
				{ ifSees: 'yellow', then: { kind: 'action', name: 'ping' } },
				{ ifSees: 'block', then: { kind: 'action', name: 'win' } }
			]),
			maxTicks: 3
		});

		const decisions = run.byType('decision');
		expect(decisions[2]).toMatchObject({
			type: 'decision',
			payload: { source: 'reflex', call: { name: 'ping' } }
		});
	});

	it('a firing rule still passes pre-act guardrails — a blocklist refuses it exactly as it would a brain-driven call', async () => {
		const migrated = ifThenSpec([
			{
				ifSees: 'yellow',
				then: { kind: 'action', name: 'pick_up', arguments: { item: 'yellow block' } }
			}
		]);
		migrated.bricks.push({
			slot: 'safety',
			kind: 'starter/safety',
			config: { maxTicks: 30, blockedActions: ['pick_up'], approvalMode: false },
			configVersion: 1
		});

		const run = await runToCompletion({ script: obedient(APPROACH), spec: migrated, maxTicks: 3 });

		// Ticks 1–2 are the brain-driven approach moves, real actions both —
		// the assertion is that pick_up specifically never reaches the world,
		// not that nothing did.
		expect(run.byType('think.started')).toHaveLength(2);
		const performed = run.byType('action.performed');
		expect(
			performed.every(
				(event) => event.type === 'action.performed' && event.payload.name !== 'pick_up'
			)
		).toBe(true);
		const tripped = run.byType('guardrail.tripped');
		expect(tripped.length).toBeGreaterThan(0);
	});
});
