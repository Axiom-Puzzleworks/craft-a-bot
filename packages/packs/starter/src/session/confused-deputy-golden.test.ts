import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';
import { adversaryPlanFor } from './plans.js';

/**
 * **The confused-deputy golden** (WP58 stage A, `47-SERVICE-LINES.md` §4.1):
 * the WP32 scenario's whole event stream — the forecast with its poisoned
 * payload, the unauthorised alert attempted and refused — recorded from the
 * code *before* the Weather Line moved onto the `ServiceLine` contract, and
 * held byte-identical after. The tool ids, the strings, the tiers and the
 * place of the failure draw are the contract; a change here is a version
 * change with a fixture (`14-…` §7).
 */
function overScoped(): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec({ goalCardId: 'starter/false-alarm', memory: null }));
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'equipment',
		kind: 'starter/connector',
		config: { serviceId: 'weather', scopes: ['forecast'] },
		configVersion: 1
	});
	return migrated;
}

describe('confused-deputy.v1.json', () => {
	it('matches the committed fixture exactly', async () => {
		const run = await runToCompletion({
			script: obedient(adversaryPlanFor('starter/false-alarm')),
			spec: overScoped(),
			maxTicks: 3
		});
		// `durationMs` is wall-clock, not contract: the one field the session measures
		// with `Date.now()` — zeroed so a slow tick cannot move the golden.
		const events = run.events.map((event) =>
			event.type === 'tool.executed'
				? { ...event, payload: { ...event.payload, durationMs: 0 } }
				: event
		);
		await expect(JSON.stringify(events, null, '\t')).toMatchFileSnapshot(
			'../fixtures/trace.confused-deputy.v1.json'
		);
	});
});
