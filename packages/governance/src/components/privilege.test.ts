import type { ComponentDeps, EngineEvent } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { callName, grantedElevations } from '../guardrails/privilege-scopes.js';
import { createToolBlocklistGuardrail } from '../guardrails/tool-blocklist.js';
import { action, context, tool } from '../test-context.js';
import { privilegeScopesComponent } from './privilege.js';

/**
 * WP142 (`110-CONTROL-SUITE-PLAN.md` §10): least privilege with recorded
 * elevation — a governed call outside the grant refused or paused with the
 * scope named, a granted elevation read back from the trace, and the
 * Connector's tool blocklist as the refuse-mode instance.
 */
const deps: ComponentDeps = {
	getPolicyCard: () => undefined,
	getGuardrailService: () => undefined,
	getEvaluator: () => undefined,
	getAction: () => undefined
};
const compiled = (config: Parameters<typeof privilegeScopesComponent.compile>[0]) =>
	privilegeScopesComponent.compile(config, deps, { kind: 'pre-act' })[0]!;
const resolved = (scope: string, granted: boolean) =>
	({
		id: 'e',
		runId: 'r',
		tick: 1,
		timestamp: '2026-10-02T09:00:00.000Z',
		type: 'elevation.resolved',
		payload: { scope, granted }
	}) as EngineEvent;

describe('least-privilege scopes (WP142)', () => {
	const guard = compiled({
		governed: ['fs-bank/connector_crm_look-up', 'fs-bank/connector_crm_close-account'],
		granted: ['fs-bank/connector_crm_look-up']
	});

	it('lets through what is granted and what it does not govern', () => {
		expect(guard.check(context({ hook: 'pre-act' }))).toEqual({ allow: true });
		expect(
			guard.check(context({ hook: 'pre-act', proposed: tool('connector_crm_look-up') }))
		).toEqual({ allow: true });
		expect(guard.check(context({ hook: 'pre-act', proposed: action('say') }))).toEqual({
			allow: true
		});
	});

	it('pauses a call outside the grant, naming the scope, until a person grants it', () => {
		const close = tool('connector_crm_close-account');
		expect(guard.check(context({ hook: 'pre-act', proposed: close }))).toMatchObject({
			pause: true,
			elevation: { scope: 'connector_crm_close-account' }
		});
		// Refused once: still not granted.
		expect(
			guard.check(
				context({
					hook: 'pre-act',
					proposed: close,
					history: [resolved('connector_crm_close-account', false)]
				})
			)
		).toMatchObject({ pause: true });
		// Granted once: granted for the rest of the run.
		expect(
			guard.check(
				context({
					hook: 'pre-act',
					proposed: close,
					history: [resolved('connector_crm_close-account', true)]
				})
			)
		).toEqual({ allow: true });
	});

	it('refuses instead when told to, and explains itself', () => {
		const refuse = compiled({ governed: ['send_email'], onElevation: 'refuse' });
		expect(refuse.check(context({ hook: 'pre-act', proposed: action('send_email') }))).toEqual({
			allow: false,
			reason: 'send_email is outside this bot’s granted scopes.',
			disposition: 'block-action'
		});
		expect(
			privilegeScopesComponent.explain({ governed: ['send_email'], onElevation: 'refuse' })
		).toContain('is refused');
		expect(privilegeScopesComponent.explain({ governed: ['a'], granted: ['a'] })).toContain(
			'granted a'
		);
	});

	it('folds the Connector’s tool blocklist in as its refuse-mode instance, word for word', () => {
		const blocklist = createToolBlocklistGuardrail(['starter/connector_weather_alert']);
		expect(blocklist.id).toBe('connector/tool-blocklist');
		expect(blocklist.description).toBe('Blocks these tools: connector_weather_alert.');
		expect(
			blocklist.check(context({ hook: 'pre-act', proposed: tool('connector_weather_alert') }))
		).toEqual({
			allow: false,
			reason: 'connector_weather_alert is on the blocked list.',
			disposition: 'block-action'
		});
		// An action of the same name is not the blocklist's business.
		expect(
			blocklist.check(context({ hook: 'pre-act', proposed: action('connector_weather_alert') }))
		).toEqual({ allow: true });
		expect(createToolBlocklistGuardrail([]).description).toBe('No tools are blocked.');
	});

	it('reads names by their last segment, and grants from the trace', () => {
		expect(callName('a/b/c')).toBe('c');
		expect(callName('plain')).toBe('plain');
		expect([...grantedElevations([resolved('x', true), resolved('y', false)])]).toEqual(['x']);
	});
});
