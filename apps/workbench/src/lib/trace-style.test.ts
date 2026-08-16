import type { EngineEvent } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { errorLabel, labelForEvent, labelOf, laneOf } from './trace-style.js';

/**
 * Trace row presentation (03-UI-UX-DESIGN.md §5.2, §9).
 */

describe('lanes and labels', () => {
	it('files each event under its brick lane', () => {
		expect(laneOf('sense')).toBe('sense');
		expect(laneOf('tool.executed')).toBe('tool');
		expect(laneOf('guardrail.tripped')).toBe('guardrail');
	});

	it('gives every row words as well as colour (03 §8)', () => {
		expect(labelOf('action.performed')).toBe('Did something');
		expect(labelOf('approval.requested')).toBe('Asked permission');
	});
});

describe('the mumble row (03 §9)', () => {
	const decision = (thought: string, call: unknown): EngineEvent =>
		({
			id: 'e1',
			runId: 'r1',
			tick: 1,
			timestamp: '2026-08-12T09:00:00.000Z',
			type: 'decision',
			payload: { thought, call }
		}) as EngineEvent;

	it('calls a reply with neither thought nor call a mumble', () => {
		// Labelling this "Decided" would hide the whole teaching moment.
		expect(labelForEvent(decision('', null))).toBe('The bot mumbled');
	});

	it('leaves a real decision alone', () => {
		expect(labelForEvent(decision('Off I go.', { kind: 'action', name: 'move' }))).toBe('Decided');
	});

	it('counts thinking without acting as a decision, not a mumble', () => {
		// A bot that thinks without acting is thinking (08 §3, WP3 amendment).
		expect(labelForEvent(decision('Just pondering.', null))).toBe('Decided');
	});
});

describe('a policy card firing (14-… §4.6, WP22)', () => {
	const checked = (policyCardId?: string): EngineEvent =>
		({
			id: 'e3',
			runId: 'r1',
			tick: 1,
			timestamp: '2026-08-12T09:00:00.000Z',
			type: 'guardrail.checked',
			payload: {
				guardrailId: 'starter/policy/no-loose-ends#rule-0',
				hook: 'pre-act',
				verdict: { allow: false, reason: 'x', disposition: 'block-action' },
				...(policyCardId ? { policyCardId } : {})
			}
		}) as EngineEvent;

	it('names the card by its local name, not the qualified id', () => {
		expect(labelForEvent(checked('starter/policy/no-loose-ends'))).toBe(
			'Safety check (no-loose-ends)'
		);
	});

	it('leaves a hand-written guardrail’s label alone — it has no card behind it', () => {
		expect(labelForEvent(checked())).toBe('Safety check');
	});
});

describe('provider errors in kit language (03 §9, 06 §7)', () => {
	const errorEvent = (kind: string): EngineEvent =>
		({
			id: 'e2',
			runId: 'r1',
			tick: 1,
			timestamp: '2026-08-12T09:00:00.000Z',
			type: 'error',
			payload: { message: 'raw provider text', kind }
		}) as EngineEvent;

	it('names each failure in words a builder can act on', () => {
		expect(labelForEvent(errorEvent('bad-key'))).toBe("This battery isn't charged");
		expect(labelForEvent(errorEvent('rate-limited'))).toBe('The brain needs a breather');
		expect(labelForEvent(errorEvent('quota'))).toBe('This battery is flat');
	});

	it('falls back for a kind it has never heard of', () => {
		// Friendly copy is a layer, never a replacement — the raw message is still
		// in the row's detail pane either way.
		expect(labelForEvent(errorEvent('something-new'))).toBe('Something went wrong');
		expect(errorLabel('engine')).toBe('Something went wrong');
	});
});
