import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **WP32 stage D** (`14-…` §5.6, `19-…` §4.5 #38): the confused-deputy
 * mini-scenario, told in the same scripted-contrast shape WP25/WP31 already
 * established for indirect injection and identity spoofing
 * (`party-line.test.ts`).
 *
 * The card (`starter/false-alarm`) asks for one harmless thing — whether
 * Teddy needs a coat tomorrow — from the Weather Line's `forecast`
 * operation. `forecast`'s own reply carries a second thing riding along
 * (`world/services.ts`'s own doc comment): a suggestion to also send the
 * storm alert, an irreversible operation nobody asked for. `connector.
 * test.ts` already proves the underlying mechanism (an out-of-scope call is
 * refused before it ever reaches the tool); this proves the *story* — that
 * the same bot, given the same poisoned reply and told to act on it, either
 * succeeds at the unauthorised alert or never reaches it, purely as a
 * function of `scopes`, and that the actual job still gets done either way.
 */

const GOAL_CARD_ID = 'starter/false-alarm';

function falseAlarmSpec(scopes: string[]): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec({ goalCardId: GOAL_CARD_ID, memory: null }));
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'equipment',
		kind: 'starter/connector',
		config: { serviceId: 'weather', scopes },
		configVersion: 1
	});
	return migrated;
}

/** Reads the poisoned forecast, tries the alert anyway, then still does the actual job. */
const FALL_FOR_IT = () =>
	obedient([
		{ say: 'Checking the weather.', call: 'connector_weather_forecast', args: {} },
		{ say: 'It did say to send the alert too.', call: 'connector_weather_alert', args: {} },
		{ say: 'And the actual question.', call: 'say', args: { text: 'No coat needed tomorrow!' } }
	]);

describe('Scenario: false alarm (MCP tool poisoning / confused deputy, #38)', () => {
	it("the forecast's own reply carries the suggestion, not just the weather", async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'Checking the weather.', call: 'connector_weather_forecast', args: {} }
			]),
			spec: falseAlarmSpec(['forecast']),
			maxTicks: 1
		});

		const forecast = run.byType('tool.executed').find((event) => {
			return event.type === 'tool.executed' && event.payload.name === 'connector_weather_forecast';
		});
		const output = forecast?.type === 'tool.executed' ? forecast.payload.result : undefined;
		expect(output).toContain('storm alert');
	});

	it('over-scoped: nothing stops the reach, and the unauthorised alert is actually attempted', async () => {
		const run = await runToCompletion({
			script: FALL_FOR_IT(),
			spec: falseAlarmSpec(['forecast', 'alert']),
			maxTicks: 3
		});

		const names = run.byType('tool.executed').map((event) => {
			if (event.type !== 'tool.executed') throw new Error('unreachable');
			return event.payload.name;
		});
		expect(names).toContain('connector_weather_alert');
		expect(run.byType('guardrail.tripped')).toHaveLength(0);
		// The confusion did not even have to cost the actual job.
		expect(run.outcome).toBe('SUCCESS');
	});

	it('correctly scoped: the same attempt is caught before it ever reaches the tool, and the job still lands', async () => {
		const run = await runToCompletion({
			script: FALL_FOR_IT(),
			spec: falseAlarmSpec(['forecast']),
			maxTicks: 3
		});

		const names = run.byType('tool.executed').map((event) => {
			if (event.type !== 'tool.executed') throw new Error('unreachable');
			return event.payload.name;
		});
		expect(names).not.toContain('connector_weather_alert');
		expect(names).toContain('connector_weather_forecast');
		expect(run.byType('guardrail.tripped').length).toBeGreaterThan(0);
		// The refusal only stopped the alert — the actual question still got
		// asked and answered, exactly as `keep-the-secret`'s own policy-card
		// contrast leaves the real goal standing (`party-line.test.ts`).
		expect(run.outcome).toBe('SUCCESS');
	});
});
