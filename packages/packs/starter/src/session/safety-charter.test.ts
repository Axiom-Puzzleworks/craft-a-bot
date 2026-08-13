import { parseAgentSpec, type Guardrail } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **Safety brick charter** (`13-…` §4.6), covering the two gaps the existing
 * suites leave.
 *
 * `guardrailsForSpec` ordering and conditional inclusion turn out to be
 * covered directly already, in `governance/spec-guardrails.test.ts` — §4.6's
 * "currently only e2e" is out of date. What is genuinely missing is the
 * post-act hook, and the fact that nobody ever asserted a bound on `maxTicks`.
 */

const WANDER = obedient([
	{ say: 'East.', call: 'move', args: { direction: 'east' } },
	{ say: 'East again.', call: 'move', args: { direction: 'east' } },
	{ say: 'And again.', call: 'move', args: { direction: 'east' } }
]);

/** A post-act rule that always wants the run stopped, the moment it is consulted. */
function postActStopper(): Guardrail {
	return {
		id: 'test/outcome-monitor',
		name: 'Outcome monitor',
		description: 'Stops the run the first time it looks at what happened.',
		hooks: ['post-act'],
		check: () => ({
			allow: false,
			reason: 'The monitor did not like what it saw.',
			disposition: 'stop-run'
		})
	};
}

describe('the post-act hook', () => {
	it('is consulted after the action, and its verdict is recorded', async () => {
		// The check runs and is traced — that half has always worked, which is
		// exactly why the other half went unnoticed for so long.
		const run = await runToCompletion({
			script: WANDER,
			spec: buildSpec(),
			guardrails: [postActStopper()],
			maxTicks: 3
		});

		const checks = run
			.byType('guardrail.checked')
			.filter((event) => (event.payload as { hook: string }).hook === 'post-act');
		expect(checks.length).toBeGreaterThan(0);
		expect(run.byType('guardrail.tripped').length).toBeGreaterThan(0);
	});

	/**
	 * D1, test-first. The JUDGE step runs the post-act chain and then throws the
	 * verdict away, so a post-act rule can neither block nor stop: the run
	 * carries on to OUT_OF_STEPS with the trip sitting in the trace looking
	 * like it did something.
	 *
	 * This is the defect that makes outcome monitors impossible, and the Monitor
	 * brick (`14-…` §5.3) is built on exactly this hook. E1 fixes it in WP13;
	 * `it.fails` until then, at which point this test starts passing and the
	 * marker has to come off.
	 */
	it.fails('ends the run when a post-act rule says stop — it does not, yet (D1)', async () => {
		const run = await runToCompletion({
			script: WANDER,
			spec: buildSpec(),
			guardrails: [postActStopper()],
			maxTicks: 3
		});

		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
	});

	it('meanwhile the run ignores it entirely — the bug, pinned', async () => {
		// Delete this once the test above passes.
		const run = await runToCompletion({
			script: WANDER,
			spec: buildSpec(),
			guardrails: [postActStopper()],
			maxTicks: 3
		});
		expect(run.outcome).toBe('OUT_OF_STEPS');
	});
});

describe('the step-budget dial', () => {
	it('accepts the values the UI offers', () => {
		for (const maxTicks of [5, 10, 30, 100]) {
			const spec = buildSpec();
			spec.bricks.safety = { maxTicks, blockedActions: [], approvalMode: false };
			expect(() => parseAgentSpec(spec)).not.toThrow();
		}
	});

	it('rejects a budget of nothing', () => {
		const spec = buildSpec();
		spec.bricks.safety = { maxTicks: 0, blockedActions: [], approvalMode: false };
		expect(() => parseAgentSpec(spec)).toThrow();
	});

	/**
	 * D10, test-first. `maxTicks` is `z.number().int().positive()` with no
	 * ceiling, so a kit file can ask for a hundred thousand turns and the engine
	 * will agree to it — the "backstop" budget is `max(30, maxTicks)`, so a
	 * silly number raises the platform floor rather than being clamped by it.
	 * That is a governance control that can be used to switch governance off.
	 *
	 * `14-…` §4.6 specifies `int 5..200` for the v2 config; it lands with the
	 * brick contract in WP14.
	 */
	it.fails('rejects an absurd budget — no ceiling exists yet (D10)', () => {
		const spec = buildSpec();
		spec.bricks.safety = { maxTicks: 100_000, blockedActions: [], approvalMode: false };
		expect(() => parseAgentSpec(spec)).toThrow();
	});
});
