import type { EngineEvent } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **L5: trace completeness** (`13-…` §9) — WP13's definition of done.
 *
 * The trace is the governance artefact (`08-…` §4). Its job is not to be a log
 * but to answer, on its own, the questions somebody reviewing a run will ask.
 * Before E8 it could not answer the first two at all: the budgets in force were
 * nowhere, and the only model reference was a cartridge id — the label on the
 * box rather than the thing that answered (`12-…` D6).
 *
 * Each test below is one audit question. They are phrased as questions on
 * purpose: a field list drifts towards whatever the code happens to emit,
 * whereas a question stays true even when the shape changes underneath it.
 */

/** A run that exercises the lot: a tool, an action, a refusal and a policy. */
async function auditableRun() {
	const spec = buildSpec({
		goalCardId: 'starter/sums-for-teddy',
		tools: ['starter/calculator']
	});
	spec.bricks.safety = {
		maxTicks: 6,
		blockedActions: ['celebrate'],
		approvalMode: false,
		repeatLimit: 3
	};

	return runToCompletion({
		script: obedient([
			{
				say: 'I could guess, but I have a calculator.',
				call: 'calculator',
				args: { expression: '17 * 23' }
			},
			{ say: 'A little dance first.', call: 'celebrate' },
			{ say: 'Telling Teddy.', call: 'say', args: { text: '17 times 23 is 391.' } }
		]),
		spec,
		maxTicks: 6
	});
}

const payloadOf = (events: EngineEvent[], type: string): Record<string, unknown> | undefined =>
	events.find((event) => event.type === type)?.payload as Record<string, unknown> | undefined;

describe('the questions a trace has to answer on its own', () => {
	it('“what model actually answered?”', async () => {
		const run = await auditableRun();

		const started = payloadOf(run.events, 'run.started');
		expect(started?.['providerId']).toBe('mock');
		expect(started?.['wireModel']).toBe('mock-1');
		expect(started?.['cartridgeId']).toBe('test/mock-brain');

		// And on every individual call, not merely once at the top: a run may
		// legitimately change cartridge in future, and "which model produced
		// *this* answer" is the question that survives that.
		const think = payloadOf(run.events, 'think.started');
		expect(think?.['wireModel']).toBe('mock-1');
		expect(think?.['providerId']).toBe('mock');
	});

	it('“what limits was it held to?”', async () => {
		const run = await auditableRun();
		const budgets = payloadOf(run.events, 'run.started')?.['budgets'] as
			Record<string, number> | undefined;

		// The *effective* budget, not the dial: the platform floor sits
		// underneath, and an audit that cannot see it cannot tell a bot that ran
		// out of turns from one that was never given enough.
		expect(budgets?.['maxTicks']).toBe(6);
		expect(budgets?.['maxTokens']).toBeGreaterThan(0);
		expect(budgets?.['requestTimeoutMs']).toBeGreaterThan(0);
	});

	it('“what policy was in force, and did it ever actually run?”', async () => {
		const run = await auditableRun();

		const checked = run.byType('guardrail.checked');
		expect(checked.length).toBeGreaterThan(0);

		// Every rule the brick compiled must appear in the trace, whether or not
		// it ever fired. A policy that leaves no trace of having run is
		// indistinguishable from one that was never fitted.
		const rules = new Set(
			checked.map((event) => (event.payload as { guardrailId: string }).guardrailId)
		);
		expect(rules).toContain('safety/step-budget');
		expect(rules).toContain('safety/action-blocklist');
		expect(rules).toContain('safety/no-repetition');
	});

	it('“what was proposed, and what became of it?”', async () => {
		const run = await auditableRun();

		const decisions = run.byType('decision');
		expect(decisions.length).toBeGreaterThan(0);

		// The blocked celebrate: proposed, refused, and never performed.
		const tripped = run
			.byType('guardrail.tripped')
			.map((event) => (event.payload as { guardrailId: string }).guardrailId);
		expect(tripped).toContain('safety/action-blocklist');

		const performed = run
			.byType('action.performed')
			.map((event) => (event.payload as { name: string }).name);
		expect(performed).not.toContain('celebrate');
	});

	it('“what did the tools actually return?” — the numbers, not the prose', async () => {
		const run = await auditableRun();
		const tool = payloadOf(run.events, 'tool.executed');

		expect(tool?.['name']).toBe('calculator');
		// E8: the structured half. Without it a reviewer checking the sum has to
		// re-parse the sentence the bot was told.
		expect(tool?.['data']).toMatchObject({ result: 391 });
	});

	it('“what changed in the world, and when?”', async () => {
		const run = await auditableRun();
		const changes = run.byType('world.changed');

		// One for the opening scene, then one per successful change.
		expect(changes.length).toBeGreaterThan(1);
		expect(payloadOf(run.events, 'world.changed')?.['state']).toBeDefined();
	});

	it('“who was this, and how did it end?”', async () => {
		const run = await auditableRun();

		// E10: every event carries the agent, so merging two bots' traces later
		// is a sort rather than a migration.
		expect(run.events.every((event) => typeof event.agentId === 'string')).toBe(true);
		expect(new Set(run.events.map((event) => event.agentId)).size).toBe(1);

		const finished = payloadOf(run.events, 'run.finished');
		expect(finished?.['outcome']).toBe('SUCCESS');
		expect(finished?.['usage']).toBeDefined();
	});

	it('answers all of them from the event stream alone, with nothing else to hand', async () => {
		// The whole point restated as one assertion: hand somebody the events
		// and nothing else, and they can still reconstruct the run.
		const run = await auditableRun();
		const serialised = JSON.stringify(run.events);

		for (const fact of ['mock-1', 'safety/step-budget', 'maxTicks', '391', 'SUCCESS']) {
			expect(serialised, `the trace cannot answer for "${fact}"`).toContain(fact);
		}
	});
});
