import { asLegacySpec, migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { guardrailsForSpec } from '@craftabot/governance';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **A v2 bot runs, and runs identically** (WP14 slice 2b).
 *
 * The engine, the validator and the guardrail compiler now accept either spec
 * shape and normalise at their own door. The assertion that matters is not
 * that v2 works — it is that v2 and v1 produce *the same run*, because a
 * format migration that quietly changes behaviour is worse than one that
 * fails outright: it is a bug nobody looks for.
 */

const PLAN = obedient([
	{ say: 'Teddy must be east.', call: 'move', args: { direction: 'east' } },
	{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
	{ say: 'There is Teddy.', call: 'move', args: { direction: 'east' } },
	{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy, I am your new robot!' } }
]);

function v2Of(v1: ReturnType<typeof buildSpec>): AgentSpecV2 {
	const migrated = migrateAgentSpec(v1);
	if ('kind' in migrated) throw new Error(migrated.message);
	return migrated;
}

/** Everything about a run that a format change must not alter. */
function shapeOf(run: Awaited<ReturnType<typeof runToCompletion>>) {
	return {
		outcome: run.outcome,
		types: run.events.map((event) => event.type),
		prompts: run
			.byType('prompt.composed')
			.map((event) => JSON.stringify((event.payload as { messages: unknown }).messages)),
		actions: run.byType('action.performed').map((event) => JSON.stringify(event.payload))
	};
}

describe('running a bot from a v2 spec', () => {
	it('reaches the same outcome as the v1 spec it came from', async () => {
		const v1 = buildSpec({ goalCardId: 'starter/say-hello' });

		const fromV1 = await runToCompletion({ script: PLAN, spec: v1, maxTicks: 6 });
		const fromV2 = await runToCompletion({ script: PLAN, spec: v2Of(v1), maxTicks: 6 });

		expect(fromV2.outcome).toBe('SUCCESS');
		expect(shapeOf(fromV2)).toEqual(shapeOf(fromV1));
	});

	it('composes a byte-identical prompt, which is where a config slip would show', async () => {
		// The prompt carries the personality, the fitted-brick list, the memory
		// window and the goal — four different bricks' configs in one string.
		const v1 = buildSpec({ goalCardId: 'starter/snack', personality: 'Cheerful and literal.' });

		const fromV1 = await runToCompletion({ script: PLAN, spec: v1, maxTicks: 2 });
		const fromV2 = await runToCompletion({ script: PLAN, spec: v2Of(v1), maxTicks: 2 });

		expect(shapeOf(fromV2).prompts).toEqual(shapeOf(fromV1).prompts);
		expect(shapeOf(fromV2).prompts[0]).toContain('Cheerful and literal.');
	});

	it('compiles the same policy from a v2 safety brick', async () => {
		const v1 = buildSpec();
		v1.bricks.safety = {
			maxTicks: 12,
			blockedActions: ['starter/playroom/celebrate'],
			approvalMode: false,
			repeatLimit: 3
		};

		const fromV1 = guardrailsForSpec(v1).map((rule) => `${rule.id}: ${rule.description}`);
		const fromV2 = guardrailsForSpec(v2Of(v1)).map((rule) => `${rule.id}: ${rule.description}`);

		expect(fromV2).toEqual(fromV1);
		expect(fromV2.length).toBeGreaterThan(1);
	});

	it('sees a bot with nothing fitted as a bot with nothing fitted', async () => {
		const bare = buildSpec({ llm: false, memory: null, senses: [], actions: [] });
		const run = await runToCompletion({
			script: PLAN,
			spec: v2Of(bare),
			maxTicks: 2,
			stepLimit: 3
		});
		expect(run.byType('run.finished')).toHaveLength(1);
	});

	/**
	 * The shim's safety rule: a brick whose config is not the v1 shape for its
	 * socket is skipped rather than misread. Without this, a Monitor brick in
	 * the safety socket would be handed to the guardrail compiler, which would
	 * read `watchFor` as `blockedActions` and quietly compile the wrong policy.
	 */
	it('ignores a brick whose config is not the shape that socket expects', () => {
		const v2 = v2Of(buildSpec());
		v2.bricks.push({
			slot: 'safety',
			kind: 'expansion/monitor',
			configVersion: 1,
			config: { watchFor: ['loops'] }
		});

		expect(asLegacySpec(v2).bricks.safety).toBeUndefined();
		expect(guardrailsForSpec(v2)).toEqual([]);
	});
});
