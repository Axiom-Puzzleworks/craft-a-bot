import { describe, expect, expectTypeOf, it } from 'vitest';
import { engineEventSchema, type EngineEvent } from './events.js';
import type { ChatResponse } from '../types/provider.js';
import type { GuardrailVerdict } from '../types/guardrail.js';
import type { RunOutcome } from '../types/agent-session.js';
import type { ActionResult, Observation } from '../types/world.js';

/**
 * **The drift guard** (`13-…` §3, holding the line on `12-…` D3).
 *
 * `RunOutcome`, `GuardrailVerdict`, `ChatResponse` and `Observation` are each
 * defined twice: a hand-written TypeScript interface that the engine programs
 * against, and a Zod mirror inside the event catalogue that validates the same
 * value on its way to and from disk. Until E5 (`14-…` §3) collapses them onto
 * one definition, the only thing keeping them in step is a comment.
 *
 * A comment is not enough, and this suite exists because it already wasn't:
 * `Observation.summary` was added to the interface in WP11 and not to the
 * mirror, so **Zod quietly deleted it from every re-imported trace**. Types
 * cannot catch that — the interface and the schema were each internally
 * consistent — and no round-trip test existed to notice a field going missing.
 *
 * Two kinds of check, because the failure has two shapes:
 *
 *  - **Type-level**, that the unions still enumerate the same members;
 *  - **Value-level**, that a fully-populated value survives `parse` with every
 *    field intact. This is the one that catches a silently dropped field, and
 *    it is why the fixtures below set *every* optional property.
 */

/** Wraps a payload in the event envelope, which is the only way these shapes are parsed. */
function envelope<T>(type: EngineEvent['type'], payload: T) {
	return {
		id: '33333333-3333-4333-8333-333333333333',
		runId: '22222222-2222-4222-8222-222222222222',
		tick: 1,
		timestamp: '2026-08-13T10:00:00Z',
		type,
		payload
	};
}

/** Parse through the catalogue and hand back what survived. */
function survives<T>(type: EngineEvent['type'], payload: T): unknown {
	return (engineEventSchema.parse(envelope(type, payload)) as { payload: unknown }).payload;
}

describe('the Zod mirrors keep every field the interfaces declare', () => {
	it('Observation — including the summary the memory window depends on', () => {
		// Every optional set on purpose: an optional field is exactly the kind
		// that goes missing without anything failing.
		const observation: Observation = {
			channels: ['sight', 'compass'],
			text: 'You look around: nothing but rug.',
			summary: 'at column 1, row 5 you could see nothing nearby; your hands were empty',
			data: { sight: { position: { x: 0, y: 4 } } }
		};

		expect(survives('sense', { channels: ['sight', 'compass'], observation })).toEqual({
			channels: ['sight', 'compass'],
			observation
		});
	});

	it('ChatResponse — including the raw wire body the trace keeps', () => {
		const response: ChatResponse = {
			text: 'I shall head east.',
			toolCall: { name: 'move', arguments: { direction: 'east' } },
			usage: { inputTokens: 120, outputTokens: 8 },
			raw: { mock: true, turnIndex: 0 },
			finishReason: 'tool_call'
		};

		expect(survives('think.completed', { response })).toEqual({ response });
	});

	it('ActionResult — including the state diff', () => {
		const result: ActionResult = {
			ok: true,
			narration: 'You roll one square east.',
			stateDiff: [{ path: 'bot.position', from: { x: 0, y: 4 }, to: { x: 1, y: 4 } }]
		};

		expect(
			survives('action.performed', { name: 'move', arguments: { direction: 'east' }, result })
		).toEqual({ name: 'move', arguments: { direction: 'east' }, result });
	});

	it('GuardrailVerdict — all three arms', () => {
		const verdicts: GuardrailVerdict[] = [
			{ allow: true, note: '2 of 3 repeats' },
			{ allow: false, reason: 'open is on the blocked list.', disposition: 'block-action' },
			{ pause: true, reason: 'A person checks every action first.' }
		];

		for (const verdict of verdicts) {
			expect(survives('guardrail.checked', { guardrailId: 'x', hook: 'pre-act', verdict })).toEqual(
				{
					guardrailId: 'x',
					hook: 'pre-act',
					verdict
				}
			);
		}
	});
});

describe('the unions still enumerate the same members', () => {
	it('RunOutcome', () => {
		// If either side gains an outcome the other has not heard of, this stops
		// compiling — which is the whole point of keeping it as a type check.
		expectTypeOf<RunOutcome>().toEqualTypeOf<
			'SUCCESS' | 'OUT_OF_STEPS' | 'STOPPED_BY_USER' | 'STOPPED_BY_GUARDRAIL' | 'ERROR'
		>();

		const parsed = engineEventSchema.parse(
			envelope('run.finished', {
				outcome: 'STOPPED_BY_GUARDRAIL',
				ticks: 4,
				usage: { inputTokens: 1, outputTokens: 1 }
			})
		);
		expect(parsed.type).toBe('run.finished');
	});

	it('rejects an outcome neither side knows about', () => {
		const result = engineEventSchema.safeParse(
			envelope('run.finished', {
				outcome: 'GAVE_UP',
				ticks: 4,
				usage: { inputTokens: 1, outputTokens: 1 }
			})
		);
		expect(result.success).toBe(false);
	});

	it('GuardrailVerdict is a closed union on both sides', () => {
		const result = engineEventSchema.safeParse(
			envelope('guardrail.checked', {
				guardrailId: 'x',
				hook: 'pre-act',
				verdict: { allow: 'maybe' }
			})
		);
		expect(result.success).toBe(false);
	});
});
