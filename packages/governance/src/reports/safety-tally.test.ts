import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { safetyTally } from './safety-tally.js';

/**
 * **Governance you can see working** (`16-…` §2.1).
 *
 * The Safety Brick is central to the toy and invisible in play: a run where it
 * checked fourteen times and stopped nothing looks exactly like a run with no
 * safety at all. The successful case is the one worth showing a child, and it
 * is the one that had no representation anywhere.
 */
let seq = 0;
function event<T extends EngineEvent['type']>(type: T, payload: unknown): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick: 1,
		timestamp: '2026-08-14T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const checked = (allow: boolean) =>
	event('guardrail.checked', {
		guardrailId: 'starter/step-budget',
		hook: 'pre-act',
		verdict: allow ? { allow: true } : { allow: false, reason: 'no', disposition: 'block-action' }
	});

const tripped = () =>
	event('guardrail.tripped', {
		guardrailId: 'starter/step-budget',
		hook: 'pre-act',
		reason: 'no',
		disposition: 'block-action'
	});

describe('safetyTally', () => {
	it('counts nothing before anything has happened', () => {
		expect(safetyTally([])).toEqual({ checks: 0, saves: 0 });
	});

	it('counts every rule the engine consulted', () => {
		expect(safetyTally([checked(true), checked(true), checked(true)]).checks).toBe(3);
	});

	/**
	 * A denial emits `guardrail.tripped` *alongside* its `guardrail.checked`, so
	 * counting tripped events counts each denial exactly once — and counting
	 * denied verdicts as well would count them twice.
	 */
	it('counts a denial once, not twice', () => {
		const tally = safetyTally([checked(true), checked(false), tripped()]);

		expect(tally).toEqual({ checks: 2, saves: 1 });
	});

	it('ignores everything that is not a guardrail', () => {
		const tally = safetyTally([
			event('sense', { channels: ['sight'], observation: { channels: [], text: '', summary: '' } }),
			checked(true),
			event('tick.completed', { tick: 1 })
		]);

		expect(tally).toEqual({ checks: 1, saves: 0 });
	});
});
