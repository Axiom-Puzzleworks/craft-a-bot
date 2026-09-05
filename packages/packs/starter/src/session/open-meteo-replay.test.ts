import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * A recorded line in a session (WP58 stage B, `47-SERVICE-LINES.md` §4.2,
 * §4.4): the Open-Meteo cassette answers a recorded call byte for byte, an
 * unrecorded one is a loud miss on the trace — `error.kind: 'cassette-miss'`
 * — and nothing ever calls out, held by a throwing `fetch` on `globalThis`
 * for the whole run.
 */
function withOpenMeteo(): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec({ goalCardId: 'starter/say-hello', memory: null }));
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'equipment',
		kind: 'starter/connector',
		config: { serviceId: 'open-meteo', scopes: ['forecast'] },
		configVersion: 1
	});
	return migrated;
}

const savedFetch = globalThis.fetch;
beforeEach(() => {
	globalThis.fetch = (() => {
		throw new Error('a session must never call out');
	}) as typeof fetch;
});
afterEach(() => {
	globalThis.fetch = savedFetch;
});

describe('the Open-Meteo line replays its cassette', () => {
	it('answers a recorded call from the recording and misses loudly on an unrecorded one', async () => {
		const run = await runToCompletion({
			script: obedient([
				{
					say: 'What is it like in London?',
					call: 'connector_open-meteo_forecast',
					args: { latitude: 51.5, longitude: -0.12 }
				},
				{
					say: 'And at the pole?',
					call: 'connector_open-meteo_forecast',
					args: { latitude: 90, longitude: 0 }
				}
			]),
			spec: withOpenMeteo(),
			maxTicks: 2
		});
		const executed = run.byType('tool.executed');
		expect(executed).toHaveLength(2);
		const [london, pole] = executed;
		expect(london?.type === 'tool.executed' ? london.payload.result : '').toContain(
			'At 51.5, -0.12 it is'
		);
		expect(pole?.type === 'tool.executed' ? pole.payload.result : '').toContain(
			'no recorded answer'
		);
		const errors = run.byType('error');
		expect(errors.map((event) => (event.type === 'error' ? event.payload.kind : ''))).toEqual([
			'cassette-miss'
		]);
	});
});
