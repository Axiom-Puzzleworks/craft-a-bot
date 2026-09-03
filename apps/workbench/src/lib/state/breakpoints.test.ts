import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { breakpointFor } from './session.svelte.js';

/** The three breakpoint kinds (WP49, `37-…` §4.3), matched against the events that trip them. */

function event(type: EngineEvent['type'], payload: unknown): EngineEvent {
	return {
		id: '00000000-0000-4000-8000-000000000001',
		runId: '11111111-1111-4111-8111-111111111111',
		tick: 3,
		timestamp: '2026-09-03T10:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

describe('breakpointFor', () => {
	it('matches a guardrail trip, a tool call and a failed action to their kinds — only when armed', () => {
		const trip = event('guardrail.tripped', {
			guardrailId: 'safety/action-blocklist',
			hook: 'pre-act',
			reason: 'no'
		});
		const tool = event('tool.executed', {
			name: 'calculator',
			arguments: {},
			result: '4',
			durationMs: 1
		});
		const failed = event('action.performed', {
			name: 'move',
			arguments: {},
			result: { ok: false, message: 'wall' }
		});
		const ok = event('action.performed', {
			name: 'move',
			arguments: {},
			result: { ok: true, message: 'moved' }
		});

		expect(breakpointFor(trip, ['guardrail-trip'])).toBe('guardrail-trip');
		expect(breakpointFor(tool, ['tool-call'])).toBe('tool-call');
		expect(breakpointFor(failed, ['action-failure'])).toBe('action-failure');
		expect(breakpointFor(ok, ['action-failure'])).toBeUndefined();

		expect(breakpointFor(trip, ['tool-call', 'action-failure'])).toBeUndefined();
		expect(breakpointFor(tool, [])).toBeUndefined();
		expect(
			breakpointFor(event('tick.completed', {}), ['guardrail-trip', 'tool-call', 'action-failure'])
		).toBeUndefined();
	});
});
