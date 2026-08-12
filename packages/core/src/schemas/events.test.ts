import { describe, expect, it } from 'vitest';
import { parseEngineEvent, safeParseEngineEvent } from './events.js';

const envelope = {
	id: '33333333-3333-4333-8333-333333333333',
	runId: '22222222-2222-4222-8222-222222222222',
	tick: 0,
	timestamp: '2026-08-12T10:00:00Z'
};

describe('engineEventSchema', () => {
	it('parses a run.started event', () => {
		const event = parseEngineEvent({ ...envelope, type: 'run.started', payload: { mode: 'step' } });
		expect(event.type).toBe('run.started');
	});

	it('parses a think.completed event with a full ChatResponse payload', () => {
		const event = parseEngineEvent({
			...envelope,
			type: 'think.completed',
			payload: {
				response: {
					text: 'I should look around.',
					toolCall: null,
					usage: { inputTokens: 50, outputTokens: 10 },
					raw: { id: 'chatcmpl-abc' },
					finishReason: 'stop'
				}
			}
		});
		if (event.type !== 'think.completed') throw new Error('wrong type narrowed');
		expect(event.payload.response.finishReason).toBe('stop');
	});

	it('parses a guardrail.tripped event', () => {
		const event = parseEngineEvent({
			...envelope,
			type: 'guardrail.tripped',
			payload: {
				guardrailId: 'safety/step-budget',
				hook: 'pre-think',
				reason: 'Out of ticks',
				disposition: 'stop-run'
			}
		});
		expect(event.type).toBe('guardrail.tripped');
	});

	it('rejects an unknown event type', () => {
		const result = safeParseEngineEvent({ ...envelope, type: 'not.a.real.event', payload: {} });
		expect(result.success).toBe(false);
	});

	it('rejects a payload that does not match its declared type', () => {
		const result = safeParseEngineEvent({
			...envelope,
			type: 'run.started',
			payload: { mode: 'sprint' }
		});
		expect(result.success).toBe(false);
	});

	it('rejects a non-uuid runId', () => {
		const result = safeParseEngineEvent({
			...envelope,
			runId: 'not-a-uuid',
			type: 'tick.started',
			payload: {}
		});
		expect(result.success).toBe(false);
	});
});
