import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../schemas/events.js';
import { applyEvent, emptyProjection, projectThrough } from './run-projection.js';

/**
 * The fold's own rules over hand-built events (WP36 stage B). The proof that
 * it folds a *real* run — the starter pack's byte-stable golden trace — reads
 * that pack's fixture from disk and therefore stays in the workbench
 * (`apps/workbench/src/lib/state/run-projection.test.ts`): core has no Node
 * types on purpose, because nothing in it reads a file. What is held here is
 * each event's effect on the projection, and that scrubbing to turn N lands
 * on the state playing to turn N produced.
 */

let seq = 0;
function event(tick: number, type: EngineEvent['type'], payload: unknown): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick,
		timestamp: '2026-09-02T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const usage = (inputTokens: number, outputTokens: number) => ({
	response: {
		text: '',
		toolCall: null,
		usage: { inputTokens, outputTokens },
		raw: {},
		finishReason: 'stop'
	}
});

const performed = (
	name: string,
	ok: boolean,
	narration: string,
	extra: Record<string, unknown> = {}
) =>
	event(2, 'action.performed', {
		name,
		arguments: name === 'say' ? { text: 'Hello Teddy' } : {},
		result: { ok, narration, ...extra }
	});

describe('the run projection', () => {
	it('starts blank', () => {
		const state = emptyProjection();
		expect(state.tick).toBe(0);
		expect(state.started).toBe(false);
		expect(state.world).toBeUndefined();
		expect(state.outcome).toBeUndefined();
		expect(state.events).toEqual([]);
	});

	it('takes the world from world.changed and the tick from every event', () => {
		const state = emptyProjection();
		applyEvent(state, event(0, 'run.started', {}));
		applyEvent(state, event(1, 'world.changed', { state: { width: 2, height: 1 } }));

		expect(state.started).toBe(true);
		expect(state.tick).toBe(1);
		expect(state.world).toEqual({ width: 2, height: 1 });
		expect(state.events).toHaveLength(2);
	});

	it('streams tokens into the bubble, then lets the decision replace them', () => {
		const state = emptyProjection();
		applyEvent(state, event(1, 'think.started', {}));
		applyEvent(state, event(1, 'think.token', { delta: 'I will ' }));
		applyEvent(state, event(1, 'think.token', { delta: 'say hello' }));
		expect(state.thinking).toBe(true);
		expect(state.streaming).toBe('I will say hello');

		applyEvent(state, event(1, 'think.completed', usage(12, 4)));
		expect(state.thinking).toBe(false);
		expect(state.usage).toEqual({ inputTokens: 12, outputTokens: 4 });

		applyEvent(state, event(1, 'decision', { thought: 'Say hello.', call: null, source: 'brain' }));
		expect(state.thought).toBe('Say hello.');
		expect(state.streaming).toBe('');

		// A second think starts a fresh stream rather than appending.
		applyEvent(state, event(2, 'think.started', {}));
		expect(state.streaming).toBe('');
		applyEvent(state, event(2, 'think.completed', usage(1, 1)));
		expect(state.usage).toEqual({ inputTokens: 13, outputTokens: 5 });
	});

	it('keeps the last thought when a decision carried none', () => {
		const state = emptyProjection();
		applyEvent(state, event(1, 'decision', { thought: 'First.', call: null, source: 'brain' }));
		applyEvent(state, event(2, 'decision', { thought: '', call: null, source: 'reflex' }));
		expect(state.thought).toBe('First.');
	});

	it('narrates an action, notes whether the world took it, and turns a say into a bubble', () => {
		const state = emptyProjection();
		applyEvent(state, performed('say', true, 'You say hello.'));
		expect(state.narration).toBe('You say hello.');
		expect(state.lastActionOk).toBe(true);
		expect(state.saying).toBe('Hello Teddy');
		expect(state.didYouMean).toEqual([]);

		applyEvent(state, performed('pick_up', false, 'Too far away.', { didYouMean: ['red block'] }));
		expect(state.lastActionOk).toBe(false);
		expect(state.saying).toBeUndefined();
		expect(state.didYouMean).toEqual(['red block']);

		// The chips belong to the turn that raised them.
		applyEvent(state, performed('move', true, 'You roll north.'));
		expect(state.didYouMean).toEqual([]);
	});

	it('remembers a trip and tracks an approval from request to resolution', () => {
		const state = emptyProjection();
		applyEvent(
			state,
			event(1, 'approval.requested', {
				proposed: { kind: 'action', name: 'open', arguments: { container: 'chest' } },
				reason: 'Ask first.'
			})
		);
		expect(state.pendingApproval).toEqual({
			kind: 'action',
			name: 'open',
			arguments: { container: 'chest' },
			reason: 'Ask first.'
		});

		applyEvent(state, event(1, 'approval.resolved', { approved: false }));
		expect(state.pendingApproval).toBeUndefined();

		applyEvent(
			state,
			event(1, 'guardrail.tripped', {
				guardrailId: 'safety/action-blocklist',
				hook: 'pre-act',
				reason: 'no',
				disposition: 'block-action'
			})
		);
		expect(state.tripped).toBe(true);
	});

	it('records how the run ended, and why when the event says', () => {
		const state = emptyProjection();
		applyEvent(
			state,
			event(3, 'run.finished', { outcome: 'SUCCESS', reason: 'declared by a person' })
		);
		expect(state.outcome).toBe('SUCCESS');
		expect(state.finishedReason).toBe('declared by a person');
	});

	it('scrubbing to turn N lands where playing to turn N did', () => {
		const events = [
			event(0, 'run.started', {}),
			event(1, 'world.changed', { state: { marker: 1 } }),
			event(1, 'think.completed', usage(5, 5)),
			event(2, 'world.changed', { state: { marker: 2 } }),
			event(2, 'think.completed', usage(5, 5)),
			event(3, 'run.finished', { outcome: 'OUT_OF_STEPS' })
		];

		const played = emptyProjection();
		for (const e of events.slice(0, 3)) applyEvent(played, e);

		const scrubbed = projectThrough(events, 1);
		expect(scrubbed).toEqual(played);
		expect(scrubbed.world).toEqual({ marker: 1 });
		expect(scrubbed.outcome).toBeUndefined();

		const whole = projectThrough(events);
		expect(whole.world).toEqual({ marker: 2 });
		expect(whole.outcome).toBe('OUT_OF_STEPS');
		expect(whole.usage).toEqual({ inputTokens: 10, outputTokens: 10 });
	});
});
