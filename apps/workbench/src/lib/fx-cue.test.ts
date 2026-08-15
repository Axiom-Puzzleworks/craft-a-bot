import { describe, expect, it } from 'vitest';
import type { EngineEvent, RunOutcome } from '@craftabot/core';
import { fxCue } from './fx-cue.js';

/**
 * **When the Playroom shows an effect** (`20-…` §5.4).
 *
 * The five artefacts exist; what has to be right is the moment. Two properties
 * carry most of the risk and are what these cover:
 *
 * 1. **An effect is momentary.** A guardrail that blocks one action and lets the
 *    run continue must stamp that action and then stop. The first design read
 *    a `tripped` flag, which is true for the rest of the run — a stamp that
 *    never comes off, over a bot that has long since moved on.
 * 2. **It is derived from events, so replay agrees with the live run.** There is
 *    one function and both screens call it.
 */

let seq = 0;
function event<T extends EngineEvent['type']>(type: T, payload: unknown): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick: 1,
		timestamp: '2026-08-15T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const thinking = () => event('think.started', { messages: [] });
const acted = (name: string, ok: boolean) =>
	event('action.performed', { name, arguments: {}, result: { ok, narration: '' } });
const tripped = (disposition: 'block-action' | 'stop-run') =>
	event('guardrail.tripped', {
		guardrailId: 'starter/no-teddy-snacks',
		hook: 'pre-act',
		reason: 'not that',
		disposition
	});
const finished = (outcome: RunOutcome) => event('run.finished', { outcome, reason: '' });

describe('fxCue', () => {
	it('shows nothing before anything has happened', () => {
		expect(fxCue([])).toBeUndefined();
	});

	it('puffs when the world refused the action', () => {
		expect(fxCue([acted('move', false)])?.cue).toBe('puzzled');
	});

	it('sparkles on a pickup, and stays out of the way of everything else', () => {
		expect(fxCue([acted('pick_up', true)])?.cue).toBe('sparkle');
		expect(fxCue([acted('move', true)])).toBeUndefined();
		expect(fxCue([acted('say', true)])).toBeUndefined();
	});

	it('stamps a blocked action even though the run carries on', () => {
		// The case the stamp was drawn for (`16-…` §2.1): without a beat here, the
		// only sign a rule fired is a row in the trace.
		expect(fxCue([tripped('block-action')])?.cue).toBe('denied');
	});

	it('lets the next turn clear it', () => {
		// A stamp is about one action, not about the rest of the run.
		expect(fxCue([tripped('block-action'), thinking()])).toBeUndefined();
		expect(fxCue([acted('move', false), thinking()])).toBeUndefined();
	});

	it('shows the later of two beats in the same turn', () => {
		// A rule that checked and allowed, then an action the world refused: the
		// refusal is the news.
		expect(fxCue([tripped('block-action'), acted('move', false)])?.cue).toBe('puzzled');
		// And the other way round — a rule that fired after the bot acted.
		expect(fxCue([acted('move', true), tripped('block-action')])?.cue).toBe('denied');
	});

	it.each([
		['SUCCESS', 'celebrating'],
		['STOPPED_BY_GUARDRAIL', 'denied'],
		['OUT_OF_STEPS', 'sleeping']
	] as const)('ends a %s run with the %s effect', (outcome, cue) => {
		expect(fxCue([acted('move', true), finished(outcome)])?.cue).toBe(cue);
	});

	it.each(['STOPPED_BY_USER', 'ERROR'] as const)('has nothing to say about %s', (outcome) => {
		// Somebody pressed stop, or the provider fell over. Neither is the world
		// saying something about itself, and neither wants a firework.
		expect(fxCue([acted('move', false), finished(outcome)])).toBeUndefined();
	});

	it('names the event that raised it, so the same cue twice is two effects', () => {
		const events = [acted('move', false), thinking(), acted('move', false)];
		expect(fxCue(events)).toEqual({ cue: 'puzzled', at: 2 });
		expect(fxCue(events.slice(0, 1))).toEqual({ cue: 'puzzled', at: 0 });
	});

	it('reads a truncated run the same way — this is what replay does', () => {
		const events = [acted('pick_up', true), thinking(), acted('move', false), finished('SUCCESS')];
		expect(fxCue(events.slice(0, 1))?.cue).toBe('sparkle');
		expect(fxCue(events.slice(0, 3))?.cue).toBe('puzzled');
		expect(fxCue(events)?.cue).toBe('celebrating');
	});
});
