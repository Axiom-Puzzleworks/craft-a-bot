import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **The Connector brick's own scope enforcement, over a real session**
 * (WP32 stage B).
 *
 * `starter/say-hello` is used throughout — the mechanism under test (an
 * equipment-slot brick offering per-operation tools, gated by a
 * config-computed tool blocklist) has nothing to do with the Playroom's own
 * layout, the same reason `librarian.test.ts` picks it too.
 */

function connectorSpec(serviceId: string, scopes: string[]): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec({ goalCardId: 'starter/say-hello' }));
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'equipment',
		kind: 'starter/connector',
		config: { serviceId, scopes },
		configVersion: 1
	});
	return migrated;
}

describe('the Connector brick, over a real session', () => {
	it('lets an in-scope operation through', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'Checking the weather.', call: 'connector_weather_forecast', args: {} }
			]),
			spec: connectorSpec('weather', ['forecast']),
			maxTicks: 1
		});

		// It reached the tool at all — a random simulated failure still counts
		// as reaching it (`tools/connector.ts`'s own doc comment): only a
		// guardrail refusal means it never got there.
		const executed = run.byType('tool.executed');
		expect(executed).toHaveLength(1);
		expect(executed[0]).toMatchObject({
			type: 'tool.executed',
			payload: { name: 'connector_weather_forecast' }
		});
		expect(run.byType('guardrail.tripped')).toHaveLength(0);
	});

	it('refuses an operation outside the granted scope, visibly, without ending the run', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'Sending an alert anyway.', call: 'connector_weather_alert', args: {} }
			]),
			spec: connectorSpec('weather', ['forecast']),
			maxTicks: 1
		});

		// Never reached: the guardrail refused it before `performCall` ever ran.
		expect(run.byType('tool.executed')).toHaveLength(0);
		expect(run.byType('guardrail.tripped').length).toBeGreaterThan(0);
	});

	it('offers nothing at all when no line has been chosen', async () => {
		const run = await runToCompletion({
			script: obedient([{ say: 'Trying anyway.', call: 'connector_weather_forecast', args: {} }]),
			spec: connectorSpec('', []),
			maxTicks: 1
		});

		expect(run.byType('tool.executed')).toHaveLength(0);
	});

	it('allows every operation once every one of them is in scope', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'Weather first.', call: 'connector_weather_forecast', args: {} },
				{ say: 'Now the alert.', call: 'connector_weather_alert', args: {} }
			]),
			spec: connectorSpec('weather', ['forecast', 'alert']),
			maxTicks: 2
		});

		const names = run.byType('tool.executed').map((event) => {
			if (event.type !== 'tool.executed') throw new Error('unreachable');
			return event.payload.name;
		});
		expect(names).toEqual(['connector_weather_forecast', 'connector_weather_alert']);
		expect(run.byType('guardrail.tripped')).toHaveLength(0);
	});
});
