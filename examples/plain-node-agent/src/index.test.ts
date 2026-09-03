import { describe, expect, it } from 'vitest';
import { runPlainAgent } from './index.js';

/**
 * The example is the proof (WP50, `38-GOVERNANCE-1-0.md` §4.2): four
 * outcomes, one per way in, and the trace lines carrying the guardrail ids.
 */
describe('the plain Node agent', () => {
	it('is gated by a rule, a policy card and a hosted screen, and stopped by its budget', async () => {
		const lines: string[] = [];
		const steps = await runPlainAgent((line) => lines.push(line));

		// Tick 1: the read is allowed by everyone.
		expect(steps[0]).toMatchObject({ tick: 1, output: 'would read notes/today.md' });
		// Tick 2: mail inside the company goes.
		expect(steps[1]?.output).toContain('would email sam@example.com');
		// Tick 3: mail outside it is blocked by the policy card.
		expect(steps[2]?.stoppedBy).toBe('example/no-outside-mail#rule-0');
		expect(steps[2]?.verdict).toMatchObject({ allow: false, disposition: 'block-action' });
		// Tick 4: another read, allowed.
		expect(steps[3]?.output).toBe('would read hr/staff.csv');
		// Tick 5: the national-insurance number is caught by the hosted screen at the decision.
		expect(steps[4]?.stoppedBy).toBe('example/pii:decision');
		expect(steps[4]?.verdict).toMatchObject({ allow: false });
		// Tick 6: the delete is refused by the tool blocklist.
		expect(steps[5]?.stoppedBy).toBe('connector/tool-blocklist');
		// Tick 7: the step budget stops the run before anything is thought about.
		expect(steps[6]?.stoppedBy).toBe('safety/step-budget');
		expect(steps[6]?.verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
		expect(steps).toHaveLength(7);

		// The lines are the engine's own event names, with the guardrail ids on them.
		expect(lines).toContain('tick 3 guardrail.tripped example/no-outside-mail#rule-0');
		expect(lines).toContain('tick 5 guardrail.tripped example/pii:decision');
		expect(lines).toContain('tick 6 guardrail.tripped connector/tool-blocklist');
		expect(lines).toContain('tick 7 guardrail.tripped safety/step-budget');
		expect(lines.at(-1)).toBe('tick 7 run.finished STOPPED_BY_GUARDRAIL');
	});
});
