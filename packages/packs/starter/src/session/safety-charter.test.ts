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
	 * D1, closed by E1 in WP13.
	 *
	 * The JUDGE step used to run the post-act chain and throw the verdict away,
	 * so a post-act rule could neither block nor stop: the run carried on to
	 * OUT_OF_STEPS with the trip sitting in the trace looking like it had done
	 * something. This test was written in WP12 marked `it.fails`; when E1
	 * landed it started passing, the marker failed, and it was promoted here.
	 * The Monitor brick (`14-…` §5.3) is built entirely on this hook.
	 */
	it('ends the run when a post-act rule says stop', async () => {
		const run = await runToCompletion({
			script: WANDER,
			spec: buildSpec(),
			guardrails: [postActStopper()],
			maxTicks: 3
		});

		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
	});

	it('stops on the first tick it disapproves of, not at the end of the budget', async () => {
		// The distinction that makes a monitor useful: it intervenes, rather
		// than merely commenting on a run that was going to end anyway.
		const run = await runToCompletion({
			script: WANDER,
			spec: buildSpec(),
			guardrails: [postActStopper()],
			maxTicks: 10
		});

		expect(run.byType('tick.started')).toHaveLength(1);
	});

	it('refuses a post-act rule that tries to block, because there is nothing left to block', async () => {
		const blocker = {
			...postActStopper(),
			id: 'test/confused-monitor',
			check: () => ({
				allow: false as const,
				reason: 'Too late.',
				disposition: 'block-action' as const
			})
		};

		const run = await runToCompletion({
			script: WANDER,
			spec: buildSpec(),
			guardrails: [blocker],
			maxTicks: 3
		});

		// Loudly, as an engine error rather than a silent no-op — quietly
		// ignoring it is exactly what D1 was.
		expect(run.outcome).toBe('ERROR');
		const error = run.byType('error')[0]?.payload as { message: string } | undefined;
		expect(error?.message).toContain('post-act');
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
