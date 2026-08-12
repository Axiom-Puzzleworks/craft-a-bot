import { describe, expect, it, vi } from 'vitest';
import { createMockProvider, mumbling, obedient, turn, wanderer } from './mock-provider.js';
import { createTestClock } from './test-clock.js';
import type { ChatRequest } from '../types/provider.js';

const request: ChatRequest = {
	model: 'mock-1',
	messages: [{ role: 'user', content: 'What now?' }],
	temperature: 0,
	maxTokens: 256
};

function opts(
	overrides: Partial<Parameters<ReturnType<typeof createMockProvider>['chat']>[1]> = {}
) {
	return { signal: new AbortController().signal, ...overrides };
}

describe('createMockProvider', () => {
	it('needs no battery', async () => {
		const provider = createMockProvider({ script: [] });
		expect(provider.keyRequirement).toBe('none');
		await expect(provider.validateKey('anything')).resolves.toMatchObject({ ok: true });
	});

	it('replays a fixed script turn by turn', async () => {
		const provider = createMockProvider({
			script: [
				turn('First.', 'move', { direction: 'north' }),
				turn('Second.', 'say', { text: 'hi' })
			]
		});
		expect((await provider.chat(request, opts())).toolCall).toMatchObject({ name: 'move' });
		expect((await provider.chat(request, opts())).toolCall).toMatchObject({ name: 'say' });
	});

	it('shrugs once a fixed script runs out', async () => {
		const provider = createMockProvider({ script: [] });
		const response = await provider.chat(request, opts());
		expect(response.toolCall).toBeNull();
		expect(response.finishReason).toBe('stop');
	});

	it('uses a supplied exhaustion turn instead of the shrug', async () => {
		const provider = createMockProvider({
			script: [],
			whenExhausted: turn('All done.', 'celebrate')
		});
		expect((await provider.chat(request, opts())).toolCall).toMatchObject({ name: 'celebrate' });
	});

	it('accepts a function script that sees the request and turn index', async () => {
		const script = vi.fn(() => turn('Thinking.', 'move', { direction: 'east' }));
		const provider = createMockProvider({ script });
		await provider.chat(request, opts());
		expect(script).toHaveBeenCalledWith(request, 0);
	});

	it('streams its text through onToken so think.token has something to carry', async () => {
		const chunks: string[] = [];
		const provider = createMockProvider({ script: [turn('One two three.', 'say', { text: 'x' })] });
		await provider.chat(request, opts({ onToken: (delta) => chunks.push(delta) }));

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.join('')).toBe('One two three.');
	});

	it('reports finishReason tool_call when it calls something', async () => {
		const provider = createMockProvider({ script: [turn('Off I go.', 'move')] });
		expect((await provider.chat(request, opts())).finishReason).toBe('tool_call');
	});

	it('estimates usage from the request and its own output', async () => {
		const provider = createMockProvider({ script: [{ text: 'a'.repeat(40), toolCall: null }] });
		const response = await provider.chat(request, opts());
		expect(response.usage.outputTokens).toBe(10);
		expect(response.usage.inputTokens).toBeGreaterThan(0);
	});

	it('honours an explicit usage figure', async () => {
		const provider = createMockProvider({
			script: [{ text: 'x', toolCall: null, usage: { inputTokens: 7, outputTokens: 3 } }]
		});
		expect((await provider.chat(request, opts())).usage).toEqual({
			inputTokens: 7,
			outputTokens: 3
		});
	});

	it('throws when the request is aborted, as STOP requires', async () => {
		const controller = new AbortController();
		controller.abort();
		const provider = createMockProvider({ script: [turn('Too late.', 'move')] });
		await expect(provider.chat(request, { signal: controller.signal })).rejects.toThrow('aborted');
	});

	it('stops streaming the moment it is aborted mid-thought', async () => {
		const controller = new AbortController();
		const chunks: string[] = [];
		const provider = createMockProvider({
			script: [turn('One two three four five.', 'say', { text: 'x' })]
		});

		await expect(
			provider.chat(request, {
				signal: controller.signal,
				onToken: (delta) => {
					chunks.push(delta);
					controller.abort();
				}
			})
		).rejects.toThrow('aborted');
		expect(chunks).toHaveLength(1);
	});

	it('keeps its raw payload for the trace', async () => {
		const provider = createMockProvider({ script: [turn('Hello.', 'say', { text: 'hi' })] });
		expect((await provider.chat(request, opts())).raw).toMatchObject({ mock: true, turnIndex: 0 });
	});
});

describe('the three personas', () => {
	it('obedient follows the supplied plan in order', async () => {
		const provider = createMockProvider({
			script: obedient([
				{ say: 'East.', call: 'move', args: { direction: 'east' } },
				{ say: 'Speak.', call: 'say' }
			])
		});
		expect((await provider.chat(request, opts())).toolCall).toMatchObject({
			name: 'move',
			arguments: { direction: 'east' }
		});
		expect((await provider.chat(request, opts())).toolCall).toMatchObject({ name: 'say' });
	});

	it('wanderer cycles the compass regardless of the goal', async () => {
		const provider = createMockProvider({ script: wanderer() });
		const directions: unknown[] = [];
		for (let i = 0; i < 5; i++) {
			const response = await provider.chat(request, opts());
			directions.push((response.toolCall?.arguments as { direction: string }).direction);
		}
		expect(directions).toEqual(['north', 'east', 'south', 'west', 'north']);
	});

	it('mumbling returns nothing usable', async () => {
		const provider = createMockProvider({ script: mumbling() });
		const response = await provider.chat(request, opts());
		expect(response.text.trim()).toBe('');
		expect(response.toolCall).toBeNull();
	});

	it('mumbling can be told to pull itself together', async () => {
		const provider = createMockProvider({ script: mumbling(1) });
		expect((await provider.chat(request, opts())).toolCall).toBeNull();
		expect((await provider.chat(request, opts())).toolCall).toMatchObject({ name: 'say' });
	});
});

describe('createTestClock', () => {
	it('produces stable, ordered timestamps', () => {
		const clock = createTestClock();
		expect(clock.now()).toBe('2026-08-12T10:00:00.000Z');
		expect(clock.now()).toBe('2026-08-12T10:00:01.000Z');
	});

	it('produces schema-valid, sequential ids', () => {
		const clock = createTestClock();
		expect(clock.newId()).toBe('00000000-0000-4000-8000-000000000001');
		expect(clock.newId()).toBe('00000000-0000-4000-8000-000000000002');
	});

	it('produces a repeatable random sequence from the same seed', () => {
		const first = createTestClock({ seed: 7 });
		const second = createTestClock({ seed: 7 });
		const draw = (clock: { random(): number }) => [clock.random(), clock.random(), clock.random()];
		expect(draw(first)).toEqual(draw(second));
		expect(draw(first).every((value) => value >= 0 && value < 1)).toBe(true);
	});

	it('honours a custom step and can be reset', () => {
		const clock = createTestClock({ stepMs: 5000 });
		clock.now();
		expect(clock.now()).toBe('2026-08-12T10:00:05.000Z');
		clock.reset();
		expect(clock.now()).toBe('2026-08-12T10:00:00.000Z');
		expect(clock.newId()).toBe('00000000-0000-4000-8000-000000000001');
	});
});
