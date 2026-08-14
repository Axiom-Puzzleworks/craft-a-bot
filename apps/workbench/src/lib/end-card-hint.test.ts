import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { endCardHint } from './end-card-hint.js';

/**
 * **"What would help?"** (`16-…` §2.3).
 *
 * OUT_OF_STEPS looks the same whether the budget was too small or the bot was
 * going in circles, and those want opposite fixes. Sending a child to turn the
 * dial up when the real problem is a loop is worse than saying nothing, so the
 * hint has to come from this run's trace and stay silent when the trace does
 * not support a diagnosis.
 */
let seq = 0;
function at<T extends EngineEvent['type']>(type: T, payload: unknown): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick: seq,
		timestamp: '2026-08-14T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const acted = (name: string, args: unknown, ok = true) =>
	at('action.performed', { name, arguments: args, result: { ok, narration: 'something' } });

const usedTool = () =>
	at('tool.executed', { name: 'starter/calculator', arguments: {}, result: {} });

describe('endCardHint', () => {
	it('says nothing to a bot that won', () => {
		expect(endCardHint('SUCCESS', [acted('move', { direction: 'east' })])).toBeUndefined();
	});

	/** Somebody pressing stop was not a bot failing at anything. */
	it('says nothing when a person stopped the run', () => {
		expect(endCardHint('STOPPED_BY_USER', [])).toBeUndefined();
	});

	/**
	 * A tripped guardrail is the system succeeding (`08-…` §3). Offering advice
	 * would frame it as a fault and teach the opposite of the lesson.
	 */
	it('says nothing when the Safety Brick stopped the run', () => {
		expect(endCardHint('STOPPED_BY_GUARDRAIL', [])).toBeUndefined();
	});

	it('spots a bot going in circles, and points at the loop-breaker', () => {
		const events = [
			acted('move', { direction: 'east' }),
			acted('move', { direction: 'east' }),
			acted('move', { direction: 'east' })
		];

		const hint = endCardHint('OUT_OF_STEPS', events);

		expect(hint?.cause).toBe('looping');
		expect(hint?.text).toContain('loop-breaker');
	});

	/** Same action, different arguments, is a bot exploring rather than stuck. */
	it('does not call it a loop when the arguments differ', () => {
		const events = [
			acted('move', { direction: 'east' }),
			acted('move', { direction: 'north' }),
			acted('move', { direction: 'west' }),
			usedTool()
		];

		expect(endCardHint('OUT_OF_STEPS', events)?.cause).toBe('budget');
	});

	it('spots a bot the room kept refusing', () => {
		const events = [
			acted('open', { what: 'chest' }, false),
			acted('give', { what: 'snack' }, false),
			acted('pick_up', { what: 'key' }, false)
		];

		const hint = endCardHint('OUT_OF_STEPS', events);

		expect(hint?.cause).toBe('kept-being-refused');
		expect(hint?.text).toContain('story strip');
	});

	it('notices a bot that never reached for a tool', () => {
		const events = [acted('move', { direction: 'east' }), acted('move', { direction: 'north' })];

		expect(endCardHint('OUT_OF_STEPS', events)?.cause).toBe('no-tools');
	});

	/** The plain case: it was getting on with it and simply ran out of room. */
	it('suggests more steps when the bot was making progress', () => {
		const events = [acted('move', { direction: 'east' }), usedTool()];

		const hint = endCardHint('OUT_OF_STEPS', events);

		expect(hint?.cause).toBe('budget');
		expect(hint?.text).toContain('step dial');
	});
});
